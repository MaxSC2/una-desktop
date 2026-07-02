/**
 * GUI Automation — управление мышью и клавиатурой.
 *
 * 5 инструментов:
 *  - open_app: открыть приложение
 *  - type_text: напечатать текст
 *  - click: клик мышью
 *  - key_press: нажать клавишу
 *  - list_windows: список окон
 *
 * Реализация через nut.js (нативные bindings) или robotjs (fallback).
 * Если ни один не установлен — возвращаем ошибку с инструкцией.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface GUIResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================
// OPEN APP
// ============================================================

export async function open_app(args: {
  app_name: string;
  args?: string[];
}): Promise<GUIResult> {
  const platform = os.platform();
  const appName = args.app_name;

  try {
    let command: string;

    if (platform === 'win32') {
      // Windows: start command
      command = `start "" "${appName}"`;
      if (args.args && args.args.length > 0) {
        command += ' ' + args.args.map((a) => `"${a}"`).join(' ');
      }
    } else if (platform === 'darwin') {
      // macOS: open command
      command = `open -a "${appName}"`;
      if (args.args && args.args.length > 0) {
        command += ' ' + args.args.map((a) => `'${a}'`).join(' ');
      }
    } else {
      // Linux: try direct command or xdg-open
      command = appName;
      if (args.args && args.args.length > 0) {
        command += ' ' + args.args.map((a) => `'${a}'`).join(' ');
      }
      command += ' &';
    }

    await execAsync(command, { timeout: 10000 });

    return {
      success: true,
      data: { app_name: appName, args: args.args ?? [], platform },
    };
  } catch (e) {
    return {
      success: false,
      error: `open_app failed: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// TYPE TEXT
// ============================================================

export async function type_text(args: {
  text: string;
  delay_ms?: number;
}): Promise<GUIResult> {
  // Проверяем наличие nut.js или robotjs
  const hasNut = await checkModule('@nut-tree/nut-js');
  const hasRobotjs = await checkModule('robotjs');

  if (!hasNut && !hasRobotjs) {
    return {
      success: false,
      error: 'type_text требует @nut-tree/nut-js или robotjs. Установите: npm install @nut-tree/nut-js',
    };
  }

  try {
    if (hasNut) {
      const nut: any = require('@nut-tree/nut-js');
      const keyboard = nut.keyboard;
      if (args.delay_ms) {
        keyboard.config.autoDelayMs = args.delay_ms;
      }
      await keyboard.type(args.text);
    } else if (hasRobotjs) {
      const robot: any = require('robotjs');
      if (args.delay_ms) {
        robot.setKeyboardDelay(args.delay_ms);
      }
      robot.typeString(args.text);
    }

    return {
      success: true,
      data: { text_length: args.text.length, delay_ms: args.delay_ms ?? 0 },
    };
  } catch (e) {
    return {
      success: false,
      error: `type_text failed: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// CLICK
// ============================================================

export async function click(args: {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
}): Promise<GUIResult> {
  const hasNut = await checkModule('@nut-tree/nut-js');
  const hasRobotjs = await checkModule('robotjs');

  if (!hasNut && !hasRobotjs) {
    return {
      success: false,
      error: 'click требует @nut-tree/nut-js или robotjs. Установите: npm install @nut-tree/nut-js',
    };
  }

  try {
    const button = args.button ?? 'left';

    if (hasNut) {
      const nut: any = require('@nut-tree/nut-js');
      const mouse = nut.mouse;
      const Point = nut.Point;
      const Button = nut.Button;

      await mouse.setPosition(new Point(args.x, args.y));
      const nutButton = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
      if (args.double) {
        await mouse.doubleClick(nutButton);
      } else {
        await mouse.leftClick();
      }
    } else if (hasRobotjs) {
      const robot: any = require('robotjs');
      robot.moveMouse(args.x, args.y);
      if (args.double) {
        robot.mouseClick(button, true);
      } else {
        robot.mouseClick(button, false);
      }
    }

    return {
      success: true,
      data: { x: args.x, y: args.y, button, double: args.double ?? false },
    };
  } catch (e) {
    return {
      success: false,
      error: `click failed: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// KEY PRESS
// ============================================================

export async function key_press(args: {
  key: string;
  modifiers?: string[]; // 'ctrl', 'shift', 'alt', 'cmd'
}): Promise<GUIResult> {
  const hasNut = await checkModule('@nut-tree/nut-js');
  const hasRobotjs = await checkModule('robotjs');

  if (!hasNut && !hasRobotjs) {
    return {
      success: false,
      error: 'key_press требует @nut-tree/nut-js или robotjs. Установите: npm install @nut-tree/nut-js',
    };
  }

  try {
    if (hasNut) {
      const nut: any = require('@nut-tree/nut-js');
      const keyboard = nut.keyboard;
      const Key = nut.Key;

      // Маппинг названий клавиш
      const keyMap: Record<string, any> = {
        enter: Key.Enter,
        escape: Key.Escape,
        tab: Key.Tab,
        space: Key.Space,
        backspace: Key.Backspace,
        delete: Key.Delete,
        up: Key.Up,
        down: Key.Down,
        left: Key.Left,
        right: Key.Right,
        ctrl: Key.LeftControl,
        shift: Key.LeftShift,
        alt: Key.LeftAlt,
        cmd: Key.LeftSuper,
      };

      const nutKey = keyMap[args.key.toLowerCase()] ?? args.key;
      const modifiers = (args.modifiers ?? []).map((m) => keyMap[m.toLowerCase()]).filter(Boolean);

      if (modifiers.length > 0) {
        await keyboard.pressKey(...modifiers, nutKey);
        await keyboard.releaseKey(nutKey, ...modifiers);
      } else {
        await keyboard.type(nutKey);
      }
    } else if (hasRobotjs) {
      const robot: any = require('robotjs');
      const modifiers = args.modifiers ?? [];
      // robotjs требует uppercase для key
      robot.keyTap(args.key.toUpperCase(), modifiers);
    }

    return {
      success: true,
      data: { key: args.key, modifiers: args.modifiers ?? [] },
    };
  } catch (e) {
    return {
      success: false,
      error: `key_press failed: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// LIST WINDOWS
// ============================================================

export async function list_windows(): Promise<GUIResult> {
  const platform = os.platform();

  try {
    let windows: Array<{ title: string; pid?: number }> = [];

    if (platform === 'win32') {
      // Windows: используем PowerShell
      const { stdout } = await execAsync(
        'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object MainWindowTitle, Id | ConvertTo-Json"',
        { timeout: 5000 }
      );
      const parsed = JSON.parse(stdout.trim() || '[]');
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      windows = arr.map((p: any) => ({ title: p.MainWindowTitle, pid: p.Id }));
    } else if (platform === 'darwin') {
      // macOS: AppleScript
      const { stdout } = await execAsync(
        'osascript -e \'tell application "System Events" to get name of every process whose background only is false\'',
        { timeout: 5000 }
      );
      windows = stdout
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title) => ({ title }));
    } else {
      // Linux: wmctrl
      try {
        const { stdout } = await execAsync('wmctrl -l', { timeout: 5000 });
        windows = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split(/\s+/);
            return { title: parts.slice(3).join(' '), pid: parseInt(parts[2], 10) };
          });
      } catch {
        return {
          success: false,
          error: 'list_windows на Linux требует wmctrl. Установите: sudo apt install wmctrl',
        };
      }
    }

    return {
      success: true,
      data: { count: windows.length, windows },
    };
  } catch (e) {
    return {
      success: false,
      error: `list_windows failed: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

async function checkModule(name: string): Promise<boolean> {
  try {
    require(name);
    return true;
  } catch {
    return false;
  }
}
