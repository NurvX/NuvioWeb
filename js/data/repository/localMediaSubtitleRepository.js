export const localMediaSubtitleRepository = {
  async getExternalSubtitleText() {
    throw new Error("Local media subtitle proxy is not available on this platform");
  }
};
