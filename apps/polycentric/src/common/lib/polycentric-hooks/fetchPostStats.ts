import { types } from '@polycentric/react-native';
import type { PolycentricClient } from '@polycentric/react-native';

export type PostStats = {
  likes: number;
  dislikes: number;
  comments: number;
  myOpinion: types.Opinion;
};

/**
 * Here we manually query the references feed once, walk the events, and
 * accumulate the stats we need in the client. The server has an endpoint
 * that can do this on our behalf, which we could use instead. If an event
 * has many references this can be costly.
 */
// TODO: fetchPostStats requires queryManager which is not yet in v2
export async function fetchPostStats(
  _client: PolycentricClient,
  _pointer: types.Pointer,
): Promise<PostStats> {
  return {
    likes: 0,
    dislikes: 0,
    comments: 0,
    myOpinion: types.Opinion.NEUTRAL,
  };
}
