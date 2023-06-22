import { PrismaClient } from '@prisma/client'
import { VercelRequest, VercelResponse } from '@vercel/node'
import Vibrant from 'node-vibrant';

const QUALITY = 2;

const prisma = new PrismaClient();

export default async function handler(_: VercelRequest, response: VercelResponse) {
    var result = await prisma.albums.findMany({
        where: {
            vibrant_color: null,
            image_url: {

            }
        }
    });

    for (let album of result) {
        const color = await extractColor(album.image_url);
        await prisma.albums.update({
            where: {
                id: album.id
            },
            data: {
                vibrant_color: color
            }
        });
    }

    response.status(200).send(`Found vibrant color for ${result.length} albums.`);
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
