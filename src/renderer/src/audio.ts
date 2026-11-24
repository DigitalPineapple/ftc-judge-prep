export async function toWhisperSamples(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  const length = Math.ceil(decoded.duration * 16000)
  const offline = new OfflineAudioContext(1, length, 16000)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0)
}

// Plays a URL and resolves when it finishes (or fails), so callers can sequence judge -> student.
export function playUrl(url: string, holder: { current: HTMLAudioElement | null }): Promise<void> {
  return new Promise((resolve) => {
    holder.current?.pause()
    const a = new Audio(url)
    holder.current = a
    a.onended = () => resolve()
    a.onerror = () => resolve()
    a.play().catch(() => resolve())
  })
}

export function speakWithSystemVoice(text: string): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}
