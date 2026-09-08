export const localMediaBitmapSubtitleRepository = {
  async prepare() {
    throw new Error("Bitmap subtitle proxy is not available on this platform");
  },
  async getWindow() {
    throw new Error("Bitmap subtitle proxy is not available on this platform");
  }
};
