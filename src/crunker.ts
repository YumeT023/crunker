export interface CrunkerConstructorOptions {
  /**
   * Sample rate for Crunker's internal audio context.
   *
   * @default 44100
   */
  sampleRate?: number;
}

export type CrunkerInputType = string | File | Blob;

/**
 * Crunker is the simple way to merge, concatenate, play, export and download audio files using the Web Audio API.
 */
export default class Crunker {
  private readonly _sampleRate: number;
  private readonly _context: AudioContext;

  /**
   * Creates a new instance of Crunker with the provided options.
   *
   * If `sampleRate` is not defined, it will auto-select an appropriate sample rate
   * for the device being used.
   */
  constructor(options: CrunkerConstructorOptions = {}) {
    this._context = this._createContext();

    options.sampleRate ||= this._context.sampleRate;

    this._sampleRate = options.sampleRate;
  }

  /**
   * Creates Crunker's internal AudioContext.
   *
   * @internal
   */
  private _createContext(): AudioContext {
    window.AudioContext =
      window.AudioContext ||
      (window as any).webkitAudioContext ||
      (window as any).mozAudioContext;
    return new AudioContext();
  }

  /**
   *
   * The internal AudioContext used by Crunker.
   */
  get context(): AudioContext {
    return this._context;
  }

  /**
   * Asynchronously fetches multiple audio files and returns an array of AudioBuffers.
   */
  async fetchAudio(...sources: CrunkerInputType[]): Promise<AudioBuffer[]> {
    return await Promise.all(
      sources.map(async (source) => {
        let buffer: ArrayBuffer;
        if (source instanceof File || source instanceof Blob) {
          buffer = await source.arrayBuffer();
        } else {
          buffer = await fetch(source).then((response) => {
            if (response.headers.has('Content-Type') && !response.headers.get('Content-Type')!.includes('audio/')) {
              console.warn(
                `Crunker: Attempted to fetch an audio file, but its MIME type is \`${response.headers.get('Content-Type')!.split(';')[0]
                }\`. We'll try and continue anyway. (file: "${source}")`
              );
            }
            return response.arrayBuffer();
          });
        }
        return await this._context.decodeAudioData(buffer);
      })
    );
  }

  /**
   * Merges (layers) multiple AudioBuffers into a single AudioBuffer.
   *
   * **Visual representation:**
   *
   * ![](https://user-images.githubusercontent.com/12958674/88806278-968f0680-d186-11ea-9cb5-8ef2606ffcc7.png)
   */
  mergeAudio(buffers: AudioBuffer[]): AudioBuffer {
    const output = this._context.createBuffer(
      this._maxNumberOfChannels(buffers),
      this._sampleRate * this._maxDuration(buffers),
      this._sampleRate
    );

    buffers.forEach((buffer) => {
      for (
        let channelNumber = 0;
        channelNumber < buffer.numberOfChannels;
        channelNumber++
      ) {
        const outputData = output.getChannelData(channelNumber);
        const bufferData = buffer.getChannelData(channelNumber);

        for (
          let i = buffer.getChannelData(channelNumber).length - 1;
          i >= 0;
          i--
        ) {
          outputData[i] += bufferData[i];
        }

        output.getChannelData(channelNumber).set(outputData);
      }
    });

    return output;
  }

  /**
   * Concatenates multiple AudioBuffers into a single AudioBuffer.
   *
   * **Visual representation:**
   *
   * ![](https://user-images.githubusercontent.com/12958674/88806297-9d1d7e00-d186-11ea-8cd2-c64cb0324845.png)
   */
  concatAudio(buffers: AudioBuffer[]): AudioBuffer {
    const output = this._context.createBuffer(
      this._maxNumberOfChannels(buffers),
      this._totalLength(buffers),
      this._sampleRate
    );
    let offset = 0;

    buffers.forEach((buffer) => {
      for (
        let channelNumber = 0;
        channelNumber < buffer.numberOfChannels;
        channelNumber++
      ) {
        output
          .getChannelData(channelNumber)
          .set(buffer.getChannelData(channelNumber), offset);
      }

      offset += buffer.length;
    });

    return output;
  }

  /**
   * Pads a specified AudioBuffer with silence from a specified start time,
   * for a specified length of time.
   *
   * Accepts float values as well as whole integers.
   *
   * @param buffer AudioBuffer to pad
   * @param padStart Time to start padding (in seconds)
   * @param seconds Duration to pad for (in seconds)
   */
  padAudio(
    buffer: AudioBuffer,
    padStart: number = 0,
    seconds: number = 0
  ): AudioBuffer {
    if (seconds === 0) return buffer;

    if (padStart < 0)
      throw new Error(
        'Crunker: Parameter "padStart" in padAudio must be positive'
      );
    if (seconds < 0)
      throw new Error(
        'Crunker: Parameter "seconds" in padAudio must be positive'
      );

    const updatedBuffer = this._context.createBuffer(
      buffer.numberOfChannels,
      Math.ceil(buffer.length + seconds * buffer.sampleRate),
      buffer.sampleRate
    );

    for (
      let channelNumber = 0;
      channelNumber < buffer.numberOfChannels;
      channelNumber++
    ) {
      const channelData = buffer.getChannelData(channelNumber);
      updatedBuffer
        .getChannelData(channelNumber)
        .set(
          channelData.subarray(0, Math.ceil(padStart * buffer.sampleRate) + 1),
          0
        );

      updatedBuffer
        .getChannelData(channelNumber)
        .set(
          channelData.subarray(
            Math.ceil(padStart * buffer.sampleRate) + 2,
            updatedBuffer.length + 1
          ),
          Math.ceil((padStart + seconds) * buffer.sampleRate)
        );
    }

    return updatedBuffer;
  }

  /**
   * Executes a callback if the browser does not support the Web Audio API.
   *
   * Returns the result of the callback, or `undefined` if the Web Audio API is supported.
   *
   * @param callback callback to run if the browser does not support the Web Audio API
   */
  notSupported<T>(callback: () => T): T | undefined {
    return this._isSupported() ? undefined : callback();
  }

  /**
   * Closes Crunker's internal AudioContext.
   */
  close(): this {
    this._context.close();
    return this;
  }

  /**
   * Returns the largest duration of the longest AudioBuffer.
   *
   * @internal
   */
  private _maxDuration(buffers: AudioBuffer[]): number {
    return Math.max(...buffers.map((buffer) => buffer.duration));
  }

  /**
   * Returns the largest number of channels in an array of AudioBuffers.
   *
   * @internal
   */
  private _maxNumberOfChannels(buffers: AudioBuffer[]): number {
    return Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
  }

  /**
   * Returns the sum of the lengths of an array of AudioBuffers.
   *
   * @internal
   */
  private _totalLength(buffers: AudioBuffer[]): number {
    return buffers.map((buffer) => buffer.length).reduce((a, b) => a + b, 0);
  }

  /**
   * Returns whether the browser supports the Web Audio API.
   *
   * @internal
   */
  private _isSupported(): boolean {
    return (
      "AudioContext" in window ||
      "webkitAudioContext" in window ||
      "mozAudioContext" in window
    );
  }

  /**
   * Writes the WAV headers for the specified Float32Array.
   *
   * Returns a DataView containing the WAV headers and file content.
   *
   * @internal
   */
  private _writeHeaders(
    buffer: Float32Array,
    numOfChannels: number,
    sampleRate: number
  ): DataView {
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const sampleSize = numOfChannels * bytesPerSample;

    const fileHeaderSize = 8;
    const chunkHeaderSize = 36;
    const chunkDataSize = buffer.length * bytesPerSample;
    const chunkTotalSize = chunkHeaderSize + chunkDataSize;

    const arrayBuffer = new ArrayBuffer(fileHeaderSize + chunkTotalSize);
    const view = new DataView(arrayBuffer);

    this._writeString(view, 0, "RIFF");
    view.setUint32(4, chunkTotalSize, true);
    this._writeString(view, 8, "WAVE");
    this._writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * sampleSize, true);
    view.setUint16(32, sampleSize, true);
    view.setUint16(34, bitDepth, true);
    this._writeString(view, 36, "data");
    view.setUint32(40, chunkDataSize, true);

    return this._floatTo16BitPCM(
      view,
      buffer,
      fileHeaderSize + chunkHeaderSize
    );
  }

  /**
   * Converts a Float32Array to 16-bit PCM.
   *
   * @internal
   */
  private _floatTo16BitPCM(
    dataview: DataView,
    buffer: Float32Array,
    offset: number
  ): DataView {
    for (let i = 0; i < buffer.length; i++, offset += 2) {
      const tmp = Math.max(-1, Math.min(1, buffer[i]));
      dataview.setInt16(offset, tmp < 0 ? tmp * 0x8000 : tmp * 0x7fff, true);
    }

    return dataview;
  }

  /**
   * Writes a string to a DataView at the specified offset.
   *
   * @internal
   */
  private _writeString(
    dataview: DataView,
    offset: number,
    header: string
  ): void {
    for (let i = 0; i < header.length; i++) {
      dataview.setUint8(offset + i, header.charCodeAt(i));
    }
  }

  /**
   * Converts an AudioBuffer to a Float32Array.
   *
   * @internal
   */
  private _interleave(input: AudioBuffer): Float32Array {
    const channels = Array.from(
      { length: input.numberOfChannels },
      (_, i) => i
    );
    const length = channels.reduce(
      (prev, channelIdx) => prev + input.getChannelData(channelIdx).length,
      0
    );
    const result = new Float32Array(length);

    let index = 0;
    let inputIndex = 0;

    // for 2 channels its like: [L[0], R[0], L[1], R[1], ... , L[n], R[n]]
    while (index < length) {
      channels.forEach((channelIdx) => {
        result[index++] = input.getChannelData(channelIdx)[inputIndex];
      });

      inputIndex++;
    }

    return result;
  }
}
