import Crunker from "crunker";

describe("Crunker", () => {
  const url = "https://unpkg.com/crunker@1.3.0/examples/server/2.mp3";
  /** @type {Crunker} */
  let audio;
  /** @type {AudioBuffer[]} */
  let buffers;

  beforeEach(async () => {
    audio = new Crunker();
    buffers = await audio.fetchAudio(url, url);
  });

  afterEach(() => {
    audio.close();
  });

  it("creates a context", () => {
    expect(audio._context).to.not.equal(null);
  });

  it("returns internal context", () => {
    expect(audio.context).to.be.instanceOf(window.AudioContext);
  });

  it("should have default sampleRate of 48000", () => {
    expect(audio.context.sampleRate).to.be.eq(48000);
  });

  it("fetches a single audio file", () => {
    expect(buffers[0]).to.have.property("sampleRate", 48000);
  });

  it("fetches multiple audio files", () => {
    buffers.map((buffer) => {
      expect(buffer).to.have.property("sampleRate", 48000);
    });
  });

  it("returns a single buffer when merging", () => {
    expect(audio.mergeAudio(buffers)).to.have.property("sampleRate", 48000);
  });

  it("returns a single buffer when concatenating", () => {
    expect(audio.concatAudio(buffers)).to.have.property("sampleRate", 48000);
  });

  it("uses correct length when concatenating", () => {
    expect(audio.concatAudio(buffers).duration.toFixed(2)).to.equal("16.30");
  });

  it("interleaves two channels", () => {
    const audioInput = buffers[0];
    const interleaved = audio._interleave(audioInput);
    const left = audioInput.getChannelData(0);
    const right = audioInput.getChannelData(1);

    expect(interleaved.length).to.equal(left.length + right.length);
    expect([interleaved[0], interleaved[1]]).to.have.same.members([
      left[0],
      right[0],
    ]);
  });
});
