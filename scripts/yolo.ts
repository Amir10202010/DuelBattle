import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const python =
  process.env.YOLO_PYTHON ||
  (process.platform === 'win32' ? '.venv-yolo/Scripts/python.exe' : '.venv-yolo/bin/python');
const child = spawn(python, ['vision/server.py'], { stdio: 'inherit', windowsHide: true });
child.on('error', () => {
  console.error('YOLO Python environment is unavailable. Follow the YOLOv8 setup in README.md.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => child.kill(signal));
