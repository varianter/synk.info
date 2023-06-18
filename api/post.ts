import Vibrant from 'node-vibrant';
import { VercelRequest, VercelResponse } from '@vercel/node';

const SHAZAM_HOST_URL = 'https://shazam.p.rapidapi.com';
const QUALITY = 2;
const SHAZAM_API_OPTIONS = {
  method: 'GET',
  headers: {
    'X-RapidAPI-Key': process.env.RAPID_API_KEY ?? '',
    'X-RapidAPI-Host': 'shazam.p.rapidapi.com'
  }
};

export default async function handler(req: VercelRequest, response: VercelResponse) {
  if (req.method !== 'POST') {
    response.status(405).send('Method not allowed.');
    return;
  }

  const requestBody = req.body;

  const tracks = await searchTrack(requestBody.title, requestBody.artist);

  let trackGenre;
  let color;

  if (tracks) {
    const track = tracks.hits[0].track;
    trackGenre = await getGenre(track.key);
    color = await extractColor(track.images.coverart);
  }

  const res = {
    trackGenre,
    color
  };

  response.status(200).json(res);
};

async function searchTrack(title: string, artist: string) {
  const searchQuery = `${artist} - ${title}`;
  let tracks;
  try {
    const searchResponse = await (
      await fetch(
        `${SHAZAM_HOST_URL}/search?term=${searchQuery}&locale=en-US&offset=0&limit=5`,
        SHAZAM_API_OPTIONS
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
        `${SHAZAM_HOST_URL}/songs/get-details?key=${trackKey}`,
        SHAZAM_API_OPTIONS
      )
    ).json();
    trackGenres = trackResponse.genres.primary;
  } catch (error) {
    console.error(error);
  }

  return trackGenres;
}

/**
 * Extract the dark vibrant color of an image.
 *
 * @param url URL to image
 * @returns Hex color
 */
async function extractColor(url: string): Promise<string | undefined> {
  const palette = await Vibrant.from(url).quality(QUALITY).getPalette();
  const darkVibrant = palette.DarkVibrant?.hex;

  return darkVibrant;
}
