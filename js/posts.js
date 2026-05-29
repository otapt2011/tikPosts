// js/posts.js
export function extractPosts(jsonData) {
  try {
    const videoList = jsonData?.Post?.Posts?.VideoList;
    if (!Array.isArray(videoList)) {
      console.warn('VideoList not found or not an array');
      return { rawTotalPosts: 0, posts: [] };
    }
    const posts = videoList.map(video => ({
      Date: video.Date || null,
      Likes: video.Likes || 0,
      CoverImage: video.CoverImage || null,
      Sound: video.Sound || null
    }));
    return { rawTotalPosts: posts.length, posts };
  } catch (error) {
    console.error('Error extracting posts:', error);
    return { rawTotalPosts: 0, posts: [] };
  }
}