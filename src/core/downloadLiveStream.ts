import evaluateCookie from '@app-cookies/evaluateCookie'
import { ffmpegCommandMKV, ffmpegCommandMP4 } from '@app-ffmpeg/ffmpegArgs'
import { runFfmpeg } from '@app-ffmpeg/runFfmpeg'
import { sanitizeUsername } from '@app-shared/sanitizeUsername'
import setStreamData from '@app-tiktok/api/getStreamData'
import { newLiveUrl } from '@app-tiktok/constants'
import fetchHTML from '@app-tiktok/fetchHTML'
import matchRoomId from '@app-tiktok/matchRoomId'
import { StreamData } from '@app-tiktok/types/StreamData'
import { FfmpegEvents } from '@app-types/FfmpegCmd'
import EventEmitter from 'events'
import fs from 'fs'
import path from 'path'
import { buildOutputName } from './buildOutputName'

export function downloadLiveStream(
  username: string,
  output: string,
  format: string
): EventEmitter & FfmpegEvents {
  const emitter = new EventEmitter() as EventEmitter & FfmpegEvents

  if (!username) {
    // We can't throw synchronously if we want to handle it via emitter, but for backward compatibility we can throw or emit error
    throw new Error(`❌ The username is empty!`)
  }

  const acceptedFormats: string[] = ['mp4', 'mkv']

  if (!acceptedFormats.includes(format)) {
    throw new Error(
      `❌ The format ${format} is not valid! Please use mp4 or mkv.`
    )
  }

  // Run async operations in the background
  ;(async () => {
    try {
      const isUrl = username.startsWith('http://') || username.startsWith('https://')
      let sanitizedUsername: string = isUrl ? 'tiktok_user' : sanitizeUsername(username)
      const liveUrl: string = isUrl ? username : newLiveUrl(sanitizedUsername)
      const myCookie: string = await evaluateCookie()
      const profileHTML: string = await fetchHTML(liveUrl)
      const roomId: string = matchRoomId(profileHTML)

      const [streamData]: [StreamData] = await Promise.all([
        setStreamData(roomId, myCookie),
      ])

      if (streamData && streamData.user) {
        sanitizedUsername = sanitizeUsername(streamData.user)
      }

      const { url, title }: StreamData = streamData

      let outputFile: string = buildOutputName(
        output,
        sanitizedUsername,
        format === 'mkv' ? 'mkv' : 'mp4'
      )

      const ffmpegCommand =
        format === 'mp4'
          ? ffmpegCommandMP4(url, title, sanitizedUsername, outputFile)
          : ffmpegCommandMKV(url, title, sanitizedUsername, outputFile)

      fs.mkdirSync(path.dirname(outputFile), { recursive: true })

      console.info(`\n✅ Downloading livestream ${title} to ./${outputFile}`)
      console.info(`\n❗ Ctrl+C to stop downloading and exit\n`)

      emitter.emit('start', {
        ...streamData,
        outputFile,
        cmdPreview: [ffmpegCommand.cmd, ...ffmpegCommand.args].join(' '),
      })

      const ffmpegProcess = runFfmpeg({
        cmd: ffmpegCommand.cmd,
        args: ffmpegCommand.args,
      })

      let isStoppedManually = false;

      emitter.on('stop', () => {
        isStoppedManually = true;
        ffmpegProcess.emit('kill')
      })

      ffmpegProcess.on('progress', (chunk: string) => {
        emitter.emit('progress', chunk)
      })

      ffmpegProcess.on('exit', (code: number | null) => {
        if (code === 0 || code === 255 || isStoppedManually) {
          console.info(`\n✅ Download completed successfully!`)
          emitter.emit('end', { outputFile, code: code || 0 })
        } else {
          console.error(`\n❌ Download failed with exit code ${code}`)
          emitter.emit(
            'error',
            new Error(`❌ Download failed with exit code ${code}`)
          )
        }
      })
      ffmpegProcess.on('error', (error: Error) => {
        console.error(`\n❌ Error during download: ${error.message}`)
        emitter.emit('error', error)
      })
    } catch (error) {
      emitter.emit(
        'error',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  })();

  return emitter
}
