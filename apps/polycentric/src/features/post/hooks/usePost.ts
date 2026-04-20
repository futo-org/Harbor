import { create } from 'zustand';

type PostState = {
  postId?: string;
  setPostId: (postId: string) => void;
};

const usePost = create<PostState>((set) => ({
  postId: undefined,
  setPostId(postId) {
    set({ postId });
  },
}));

export default usePost;
