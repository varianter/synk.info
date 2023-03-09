export const config = {
  runtime: 'edge'
};

const SHAZAM_HOST_URL = 'https://shazam.p.rapidapi.com';

const shazamApiOptions = {
  method: 'GET',
  headers: {
    'X-RapidAPI-Key': process.env.RAPID_API_KEY ?? '',
    'X-RapidAPI-Host': 'shazam.p.rapidapi.com'
  }
};

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 });
  }

  const requestBody = await new Response(req.body).json();

  const tracks = await searchTrack(requestBody.title, requestBody.artist);

  let trackGenres;
  if (tracks) {
    const trackKey = tracks.hits[0].track.key;
    trackGenres = await getGenre(trackKey);
  }

  return new Response(trackGenres ?? req.url);
};

async function searchTrack(title: string, artist: string) {
  const searchQuery = `${artist} - ${title}`;
  let tracks;
  try {
    const searchResponse = await (
      await fetch(
        `${SHAZAM_HOST_URL}/search?term=${searchQuery}&locale=en-US&offset=0&limit=5`,
        shazamApiOptions
      )
    ).json();
    tracks = searchResponse.tracks;
  } catch (error) {
    console.error(error);
  }

  return tracks;
}

async function getGenre(trackKey: string) {
  let trackGenres;
  try {
    const trackResponse = await (
      await fetch(
        `${SHAZAM_HOST_URL}/songs/get-details?key=${trackKey}&locale=en-US`,
        shazamApiOptions
      )
    ).json();
    trackGenres = trackResponse.genres.primary;
  } catch (error) {
    console.error(error);
  }

  return trackGenres;
}
