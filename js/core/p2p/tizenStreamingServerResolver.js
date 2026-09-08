export const TizenStreamingServerResolver = {
  canResolveStream() {
    return false;
  },
  getResolvedStreamState() {
    return null;
  },
  async resolve() {
    return null;
  },
  async remove() {
    return false;
  }
};
