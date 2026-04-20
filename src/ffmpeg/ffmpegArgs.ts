import { FfmpegCmd } from '../types/FfmpegCmd'

/**
 * It takes a string as an argument and returns a FfmpegCmd object.
 *
 * @param {string} liveUrl - The live URL of the TikTok live stream.
 * @param {string} title - The title of the TikTok live stream.
 * @param {string} username - The username of the TikTok account.
 * @param {string} fileName - The name of the file to save the live stream to.
 * @returns {FfmpegCmd} object - The ffmpeg command to download the live stream in MP4 format.
 */

export const ffmpegCommandMP4 = (
  liveUrl: string,
  title: string,
  username: string,
  fileName: string
): FfmpegCmd => {
  const year = new Date().getFullYear().toString()

  return {
    cmd: `ffmpeg`,
    args: [
      /* --- Global Options (MUST be before -i) --- */
      '-y',                     // overwrite output files (prevents 0KB leftover blocking)
      '-hide_banner',
      '-loglevel', 'info',
      '-stats',

      /* --- Network Resilience --- */
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_delay_max', '5',
      '-rw_timeout', '8000000', // timeout in microseconds
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      '-probesize', '8M',

      /* --- Input --- */
      '-use_wallclock_as_timestamps', '1',
      '-fflags', '+genpts',
      '-i', liveUrl,

      /* --- Stream Selection (exclude subtitle/data via negative mapping) --- */
      '-map', '0',              // map all streams first
      '-map', '-0:s',           // then REMOVE subtitle streams
      '-map', '-0:d',           // then REMOVE data streams

      /* --- Container and Metadata --- */
      '-c', 'copy',
      '-map_metadata', '0',
      '-movflags', '+frag_keyframe+empty_moov',  // write header upfront so file is playable even if interrupted
      '-metadata', `title=${title}`,
      '-metadata', `artist=${username}`,
      '-metadata', `date=${year}`,
      '-metadata', `comment=Downloaded from TikTok Live`,

      /* --- Output Format --- */
      '-f', 'mp4',
      fileName,
    ],
  }
}

/**
 * It takes a string as an argument and returns a FfmpegCmd object.
 *
 * @param {string} liveUrl - The live URL of the TikTok live stream.
 * @param {string} fileName - The name of the file to save the live stream to.
 * @returns {FfmpegCmd} object - The ffmpeg command to download the live stream in MKV format.
 */

export const ffmpegCommandMKV = (
  liveUrl: string,
  title: string,
  username: string,
  fileName: string
): FfmpegCmd => {
  const year = new Date().getFullYear().toString()
  return {
    cmd: `ffmpeg`,
    args: [
      /* --- Global Options (MUST be before -i) --- */
      '-y',                     // overwrite output files (prevents 0KB leftover blocking)
      '-hide_banner',
      '-loglevel', 'info',
      '-stats',

      /* --- Network Resilience --- */
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_delay_max', '5',
      '-rw_timeout', '8000000', // timeout in microseconds
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',

      /* --- Input --- */
      '-i', liveUrl,

      /* --- Stream Selection (exclude subtitle/data via negative mapping) --- */
      '-map', '0',              // map all streams first
      '-map', '-0:s',           // then REMOVE subtitle streams
      '-map', '-0:d',           // then REMOVE data streams

      /* --- Video Encoding --- */
      '-c:v', 'libx265',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-x265-params', 'keyint=48:min-keyint=48:scenecut=0:repeat-headers=1',

      /* --- Audio Encoding --- */
      '-c:a', 'copy',

      /* --- Metadata --- */
      '-metadata', `title=${title}`,
      '-metadata', `artist=${username}`,
      '-metadata', `date=${year}`,
      '-metadata', `comment=Downloaded from TikTok Live`,

      /* --- MKV Container --- */
      '-f', 'matroska',
      fileName,
    ],
  }
}
