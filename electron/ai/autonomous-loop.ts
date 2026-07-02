/**
 * Autonomous Loop — цикл "план → исполнение → проверка → откат → отчёт".
 *
 * L2 автономность: получает цель, разбивает на подзадачи, выполняет,
 * проверяет через Verifier, откатывает при ошибке.
 *
 * Лимиты:
 *  - Timeout на шаг: 5 минут
 *  - Max итераций на цель: 10
 *  - Max модификаций файлов за цикл: 20
 */

import { Goal, Subtask, createGoal, addSubtask, updateSubtaskStatus, getNextSubtask, getGoalProgress, updateGoalStatus } from './goal-tracker';
import { createBackup, restoreBackup, BackupRecord } from './rollback';
import { orchestrate } from '../agents';
import { ChatMessage } from './llm';
import { ToolContext } from '../tools';

export interface AutonomousLoopOptions {
  maxIterations?: number;
  stepTimeoutMs?: number;
  maxFileModifications?: number;
  verifyEachStep?: boolean;
  requireConfirmationForDangerous?: boolean;
}

const DEFAULT_OPTIONS: Required<AutonomousLoopOptions> = {
  maxIterations: 10,
  stepTimeoutMs: 5 * 60 * 1000, // 5 минут
  maxFileModifications: 20,
  verifyEachStep: true,
  requireConfirmationForDangerous: true,
};

export interface LoopStepResult {
  iteration: number;
  subtask: Subtask;
  success: boolean;
  response?: string;
  error?: string;
  backupsCreated: BackupRecord[];
  verifierApproved?: boolean;
  rolledBack: boolean;
  timestamp: string;
}

export interface AutonomousLoopResult {
  goal: Goal;
  steps: LoopStepResult[];
  success: boolean;
  completedSubtasks: number;
  failedSubtasks: number;
  totalIterations: number;
  totalBackupsCreated: number;
  totalRollbacks: number;
  finalMessage: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Главный цикл автономного выполнения.
 *
 * @param goalDescription Описание цели на естественном языке
 * @param context Контекст диалога (предыдущие сообщения)
 * @param toolContext Контекст инструментов (confirmedTokens и т.д.)
 * @param onProgress Callback для отчёта прогресса (опционально)
 * @param options Опции цикла
 */
export async function runAutonomousLoop(
  goalDescription: string,
  context: ChatMessage[],
  toolContext: ToolContext,
  onProgress?: (step: LoopStepResult, progress: { completed: number; total: number; percentage: number }) => void,
  options: AutonomousLoopOptions = {}
): Promise<AutonomousLoopResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startedAt = new Date().toISOString();

  // 1. Создаём цель
  const goal = createGoal(goalDescription, { priority: 'medium' });

  // 2. Планирование — LLM разбивает цель на подзадачи
  const planningContext: ChatMessage[] = [
    {
      role: 'system',
      content: 'Ты — Planner. Разбей задачу на 3-7 конкретных подзадач. Каждая подзадача должна быть выполнимой одним инструментом или короткой цепочкой. Отвечай JSON массивом: [{"description": "..."}, ...]',
    },
    ...context.slice(-5),
    { role: 'user', content: `Разбей на подзадачи: ${goalDescription}` },
  ];

  const steps: LoopStepResult[] = [];
  let totalBackupsCreated = 0;
  let totalRollbacks = 0;
  let fileModifications = 0;

  try {
    // Используем orchestrator для планирования
    const planResult = await orchestrate(
      `Разбей на подзадачи: ${goalDescription}`,
      planningContext,
      toolContext,
      { verifyDangerous: false }
    );

    // Парсим подзадачи из ответа
    const subtasks = parseSubtasksFromResponse(planResult.specialistResponse.content);

    if (subtasks.length === 0) {
      // Fallback: одна подзадача = вся цель
      addSubtask(goal.id, goalDescription);
    } else {
      for (let i = 0; i < subtasks.length; i++) {
        addSubtask(goal.id, subtasks[i], i);
      }
    }

    // 3. Выполнение цикла
    for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
      // Берём следующую невыполненную подзадачу
      const nextSubtask = getNextSubtask(goal.id);
      if (!nextSubtask) {
        // Все подзадачи выполнены
        break;
      }

      // Проверяем лимит модификаций
      if (fileModifications >= opts.maxFileModifications) {
        updateGoalStatus(goal.id, 'paused');
        return buildResult(
          goal,
          steps,
          false,
          `Превышен лимит модификаций файлов (${opts.maxFileModifications}). Цель приостановлена.`,
          startedAt,
          totalBackupsCreated,
          totalRollbacks
        );
      }

      // Помечаем подзадачу как in_progress
      updateSubtaskStatus(nextSubtask.id, 'in_progress');

      const stepBackups: BackupRecord[] = [];
      let stepSuccess = false;
      let stepResponse: string | undefined;
      let stepError: string | undefined;
      let verifierApproved: boolean | undefined;
      let rolledBack = false;

      try {
        // Выполняем подзадачу через orchestrator
        const stepResult = await orchestrate(
          nextSubtask.description,
          [...context, { role: 'system', content: `Подзадача цели "${goalDescription}": ${nextSubtask.description}` }],
          toolContext,
          { verifyDangerous: opts.verifyEachStep, useSelfConsistency: true }
        );

        stepResponse = stepResult.specialistResponse.content;

        // Создаём бэкапы для файлов, которые были изменены
        for (const tc of stepResult.toolCallHistory) {
          if (['edit_file', 'write_file', 'apply_patch'].includes(tc.name)) {
            const filePath = (tc.args as any).path;
            if (filePath) {
              const backup = await createBackup(filePath, `autonomous_${tc.name}`);
              if (backup) {
                stepBackups.push(backup);
                totalBackupsCreated++;
              }
              fileModifications++;
            }
          }
        }

        // Verifier
        if (stepResult.verifierResult) {
          verifierApproved = stepResult.verifierResult.approved;
          if (!verifierApproved && opts.requireConfirmationForDangerous) {
            // Откатываем
            for (const backup of stepBackups) {
              await restoreBackup(backup.id);
              totalRollbacks++;
            }
            rolledBack = true;
            stepError = `Verifier отклонил: ${stepResult.verifierResult.reason}`;
          } else {
            stepSuccess = true;
          }
        } else {
          stepSuccess = true;
        }
      } catch (e) {
        stepError = (e as Error).message;

        // Откатываем при ошибке
        for (const backup of stepBackups) {
          await restoreBackup(backup.id);
          totalRollbacks++;
        }
        rolledBack = true;
      }

      // Обновляем статус подзадачи
      updateSubtaskStatus(
        nextSubtask.id,
        stepSuccess ? 'completed' : 'failed',
        stepResponse ?? stepError
      );

      const stepResultRecord: LoopStepResult = {
        iteration: iteration + 1,
        subtask: nextSubtask,
        success: stepSuccess,
        response: stepResponse,
        error: stepError,
        backupsCreated: stepBackups,
        verifierApproved,
        rolledBack,
        timestamp: new Date().toISOString(),
      };
      steps.push(stepResultRecord);

      // Прогресс callback
      if (onProgress) {
        const progress = getGoalProgress(goal.id);
        onProgress(stepResultRecord, progress);
      }

      // Если подзадача провалена и нет更多 подзадач — цель провалена
      if (!stepSuccess) {
        const progress = getGoalProgress(goal.id);
        if (progress.pending === 0) {
          updateGoalStatus(goal.id, 'failed');
          return buildResult(
            goal,
            steps,
            false,
            `Цель провалена: последняя подзадача не выполнена. ${stepError ?? ''}`,
            startedAt,
            totalBackupsCreated,
            totalRollbacks
          );
        }
      }
    }

    // 4. Итог
    const finalProgress = getGoalProgress(goal.id);
    const success = finalProgress.percentage === 100;

    updateGoalStatus(goal.id, success ? 'completed' : 'paused');

    return buildResult(
      goal,
      steps,
      success,
      success
        ? `Цель выполнена! Все ${finalProgress.completed} подзадач завершены.`
        : `Цель частично выполнена: ${finalProgress.completed}/${finalProgress.total} подзадач. Приостановлена.`,
      startedAt,
      totalBackupsCreated,
      totalRollbacks
    );
  } catch (e) {
    updateGoalStatus(goal.id, 'failed');
    return buildResult(
      goal,
      steps,
      false,
      `Критическая ошибка: ${(e as Error).message}`,
      startedAt,
      totalBackupsCreated,
      totalRollbacks
    );
  }
}

// ============================================================
// HELPERS
// ============================================================

function parseSubtasksFromResponse(content: string): string[] {
  // Ищем JSON массив в ответе
  const jsonMatch = content.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && item.description) return String(item.description);
            return null;
          })
          .filter((s): s is string => s !== null);
      }
    } catch {
      // ignore
    }
  }

  // Fallback: парсим по строкам с "- " или "1. " в начале
  const lines = content.split('\n');
  const subtasks: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*[-*\d.]+\s+(.+)/);
    if (match && match[1].trim().length > 5) {
      subtasks.push(match[1].trim());
    }
  }

  return subtasks.slice(0, 7); // максимум 7 подзадач
}

function buildResult(
  goal: Goal,
  steps: LoopStepResult[],
  success: boolean,
  finalMessage: string,
  startedAt: string,
  totalBackupsCreated: number,
  totalRollbacks: number
): AutonomousLoopResult {
  const completedSubtasks = steps.filter((s) => s.success).length;
  const failedSubtasks = steps.filter((s) => !s.success).length;

  return {
    goal,
    steps,
    success,
    completedSubtasks,
    failedSubtasks,
    totalIterations: steps.length,
    totalBackupsCreated,
    totalRollbacks,
    finalMessage,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
