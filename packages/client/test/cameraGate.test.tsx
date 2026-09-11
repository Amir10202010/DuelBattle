// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraGate } from '../src/screens/CameraGate.jsx';
import type { CameraState, CameraStatus } from '../src/media/useCamera.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(status: CameraStatus, message: string) {
  const camera: CameraState = {
    status,
    message,
    devices: [],
    deviceId: null,
    videoRef: { current: null },
    request: () => {},
    selectDevice: () => {},
    stop: () => {},
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<CameraGate camera={camera} roomCode="ABCDE" onLeave={() => {}} />));
  return {
    title: container.querySelector('.gate__title')?.textContent ?? '',
    button: container.querySelector('.gate__actions button')?.textContent ?? '',
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('the camera gate after an attempt that failed', () => {
  it('invites you to turn the camera on before anything has happened', () => {
    const view = render('idle', 'Battle needs your camera.');
    expect(view.title).toBe('Turn on your camera');
    expect(view.button).toBe('Enable camera');
    view.unmount();
  });

  const failures: [CameraStatus, string][] = [
    ['denied', 'The camera is blocked'],
    ['insecure', 'The camera is blocked'],
    ['not-found', 'No camera to use'],
    ['in-use', 'The camera is busy'],
    ['error', 'The camera would not start'],
  ];

  for (const [status, title] of failures) {
    it(`says "${title}" and offers another go when the camera is ${status}`, () => {
      // The heading used to keep saying "Turn on your camera" over a sentence
      // explaining why turning it on had just failed.
      const view = render(status, 'Something went wrong.');
      expect(view.title).toBe(title);
      expect(view.button).toBe('Try again');
      view.unmount();
    });
  }
});
