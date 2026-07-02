/**
 * Toast notifications — показывают ошибки/предупреждения пользователю.
 * Использует sonner (уже в зависимостях).
 */

import { toast } from 'sonner';

export function showError(message: string, duration: number = 5000) {
  toast.error(message, { duration });
}

export function showSuccess(message: string, duration: number = 3000) {
  toast.success(message, { duration });
}

export function showWarning(message: string, duration: number = 4000) {
  toast.warning(message, { duration });
}

export function showInfo(message: string, duration: number = 3000) {
  toast.info(message, { duration });
}
