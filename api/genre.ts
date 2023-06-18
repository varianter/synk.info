import { PrismaClient } from '@prisma/client'
import { VercelRequest, VercelResponse } from '@vercel/node'

const SHAZAM_HOST_URL = 'https://shazam.p.rapidapi.com';
const SHAZAM_API_OPTIONS = {
    method: 'GET',
    headers: {
        'X-RapidAPI-Key': process.env.RAPID_API_KEY ?? '',
        'X-RapidAPI-Host': 'shazam.p.rapidapi.com'
    }
};

const prisma = new PrismaClient()

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const result = await prisma.tracks.findMany({
        where: {
            genre: null
        },
        include: {
            albums: true,
        }
    });

    let tracksGenre_ified = 0;
    for (let track of result) {
        const search = await searchTrack(track.name, track.albums.name);
        if (search) {
            const hit = search.hits[0].track;
            let trackGenre = await getGenre(hit.key);
            await prisma.tracks.update({
                where: {
                    id: track.id
                },
                data: {
                    genre: trackGenre
                }
            });
            tracksGenre_ified++;
        };
    }

    return res.status(200).send(`Found missing genre for ${tracksGenre_ified} tracks.`)
}

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
