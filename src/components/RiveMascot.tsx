import { useRive, useStateMachineInput } from '@rive-app/react-canvas';
import { Cat } from 'lucide-react';
import { MascotEmotion, MascotStatus } from './UnaMascot';

interface RiveMascotProps {
  emotion?: MascotEmotion;
  status?: MascotStatus;
  size?: number;
  src?: string;
}

const STATUS_TO_RIVE: Record<MascotStatus, string> = {
  idle: 'idle',
  thinking: 'thinking',
  speaking: 'speaking',
  listening: 'listening',
  executing: 'working',
  awaiting_confirmation: 'idle',
};

const EMOTION_TO_RIVE: Record<MascotEmotion, string> = {
  neutral: 'neutral',
  happy: 'happy',
  sad: 'sad',
  frustrated: 'angry',
  excited: 'excited',
  anxious: 'worried',
  thinking: 'thinking',
};

export function RiveMascot({ emotion = 'neutral', status = 'idle', size = 48, src }: RiveMascotProps) {
  const { RiveComponent, rive } = useRive({
    src: src ?? '',
    stateMachines: 'State Machine 1',
    autoplay: true,
  });

  const statusInput = useStateMachineInput(rive, 'State Machine 1', 'status');
  const emotionInput = useStateMachineInput(rive, 'State Machine 1', 'emotion');

  if (statusInput) (statusInput as unknown as { value: string }).value = STATUS_TO_RIVE[status];
  if (emotionInput) (emotionInput as unknown as { value: string }).value = EMOTION_TO_RIVE[emotion];

  if (!src) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-una-500/5"
        style={{ width: size, height: size }}
      >
        <Cat className="text-una-400/50" style={{ width: size * 0.6, height: size * 0.6 }} />
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }}>
      <RiveComponent style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
