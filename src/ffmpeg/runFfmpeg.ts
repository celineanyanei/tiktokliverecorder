import EventEmitter from 'node:events'
import { FfmpegCmd, FfmpegEvents } from '../types/FfmpegCmd'
import { spawn } from 'node:child_process'

// Patterns that spam thousands of lines/sec and crash the browser
const NOISY_PATTERNS = [
  'Non-monotonous DTS',
  'non monotonically increasing dts',
  'DTS out of order',
  'changing to',
  'discarding frame',
]

function isNoisyLine(text: string): boolean {
  return NOISY_PATTERNS.some(p => text.includes(p))
}

export const runFfmpeg = ({
  cmd,
  args,
}: FfmpegCmd): EventEmitter & FfmpegEvents => {
  const emitter = new EventEmitter() as unknown as EventEmitter &
    Record<keyof FfmpegEvents, (...a: any) => void>

  const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk) => {
    // Always log to server console for debugging
    process.stdout.write(chunk)
    // Only emit non-noisy lines to prevent browser SSE flood
    if (!isNoisyLine(chunk)) {
      emitter.emit('progress', chunk)
    }
  })

  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk) => {
    // Always log to server console for debugging
    process.stderr.write(chunk)
    // Only emit non-noisy lines to prevent browser SSE flood
    if (!isNoisyLine(chunk)) {
      emitter.emit('progress', chunk)
    }
  })

  proc.on('exit', (code) => {
    emitter.emit('exit', code)
  })

  proc.on('error', (error) => {
    process.stderr.write(`❌ Error: ${error.message}\n`)
    emitter.emit('error', error)
  })

  emitter.on('kill', (signal?: NodeJS.Signals) => {
    // Write 'q' to stdin to gracefully stop FFmpeg and write moov atom (MP4 header)
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write('q\n')
    } else {
      proc.kill(signal || 'SIGINT')
    }
  })

  return emitter
}

