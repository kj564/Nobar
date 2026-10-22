/**
 * Mock fixtures — sample TMDB-shaped JSON used by every spec.
 *
 * Shape mirrors what the Go backend passes through (TMDB `/trending/movie/week`,
 * `/search/movie`, `/movie/{id}?append_to_response=credits,similar`).
 */

export const mockConfig = {
  servers: [
    { id: 'utama', name: 'Server 1 (HD)', pattern: 'https://example.test/embed/{video_id}', quality: '1080p', load: 32, recommended: true },
    { id: 'cadangan', name: 'Server 2 (Fast)', pattern: 'https://example.test/alt/{video_id}', quality: '720p', load: 15, recommended: false },
  ],
  creators: [
    { name: 'Aisyah Putri', role: 'Dokumenter', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80' },
    { name: 'Bayu Mahendra', role: 'Musisi', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc664aec0?auto=format&fit=crop&w=200&q=80' },
    { name: 'Koli Animation', role: 'Studio Animasi', avatar: 'https://images.unsplash.com/photo-1611162616475-46b9b41f9f9b?auto=format&fit=crop&w=200&q=80' },
  ],
};

export const mockTrendingPage1 = {
  page: 1,
  total_pages: 3,
  total_results: 57,
  results: [
    { id: 101, title: 'Example Action Movie', poster_path: '/abc101.jpg', release_date: '2024-05-01', vote_average: 7.2, vote_count: 1234 },
    { id: 102, title: 'Example Drama Film', poster_path: '/abc102.jpg', release_date: '2023-11-12', vote_average: 8.1, vote_count: 5678 },
    { id: 103, title: 'Example Comedy', poster_path: '/abc103.jpg', release_date: '2025-02-20', vote_average: 6.9, vote_count: 432 },
  ],
};

export const mockTrendingPage2 = {
  page: 2,
  total_pages: 3,
  total_results: 57,
  results: [
    { id: 201, title: 'Example Animation', poster_path: '/abc201.jpg', release_date: '2024-07-04', vote_average: 7.5, vote_count: 980 },
    { id: 202, title: 'Example Horror', poster_path: '/abc202.jpg', release_date: '2022-10-31', vote_average: 6.4, vote_count: 321 },
  ],
};

export const mockDiscover = {
  page: 1,
  total_pages: 1,
  total_results: 2,
  results: [
    { id: 301, title: 'Action Specific Movie', poster_path: '/abc301.jpg', release_date: '2024-01-15', vote_average: 7.0, vote_count: 999 },
    { id: 302, title: 'Another Action Movie', poster_path: '/abc302.jpg', release_date: '2023-06-09', vote_average: 6.8, vote_count: 412 },
  ],
};

export const mockSearchResults = {
  page: 1,
  total_pages: 1,
  total_results: 1,
  results: [
    { id: 999, title: 'Searched Movie Title', poster_path: '/abc999.jpg', release_date: '2024-08-08', vote_average: 8.0, vote_count: 5000 },
  ],
};

export const mockMovieDetail = {
  id: 101,
  title: 'Example Action Movie',
  overview: 'A description of the example action movie.',
  runtime: 118,
  release_date: '2024-05-01',
  vote_average: 7.2,
  vote_count: 1234,
  genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }],
  credits: {
    cast: [
      { id: 11, name: 'Actor One', character: 'Hero', profile_path: '/p11.jpg', order: 0 },
      { id: 12, name: 'Actor Two', character: 'Villain', profile_path: '/p12.jpg', order: 1 },
    ],
    crew: [
      { id: 21, name: 'Director Name', job: 'Director' },
    ],
  },
  similar: {
    results: [
      { id: 410, title: 'Similar Movie A', poster_path: '/sim410.jpg', release_date: '2022-03-03', vote_average: 6.8, vote_count: 200 },
    ],
  },
};
