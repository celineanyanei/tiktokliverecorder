import EventEmitter from 'node:events'
import { FfmpegCmd, FfmpegEvents } from '../types/FfmpegCmd'
import { spawn } from 'node:child_process'

export const runFfmpeg = ({
  cmd,
  args,
}: FfmpegCmd): EventEmitter & FfmpegEvents => {
  const emitter = new EventEmitter() as unknown as EventEmitter &
    Record<keyof FfmpegEvents, (...a: any) => void>

  const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })

  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    emitter.emit('progress', chunk)
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
