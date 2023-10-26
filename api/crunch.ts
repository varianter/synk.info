import { PrismaClient } from '@prisma/client'
import { VercelRequest, VercelResponse } from '@vercel/node'

const prisma = new PrismaClient();
const topX = 10;
const tracksPerGenreToplist = 30;

export default async function handler(_: VercelRequest, response: VercelResponse) {
    const playedTracks = await fetchPlayedTracksLast7days();
    const groupedData = groupPlayedTracks(playedTracks);
    const dataAsLists = transformGroupedDataToLists(groupedData);
    const playlists = computePlaylists(dataAsLists);

    await prisma.playlists.updateMany({
        where: { is_current_top_list: true },
        data: { is_current_top_list: false }
    });

    for (let playlist of playlists) {
        await createPlaylist(playlist);
    }

    response.status(200).send(`Created ${playlists.length} playlists.`);
}

function groupPlayedTracks(playedTracks: PlayedTrack[]): Groups {
    const stats: Groups = {};
    for (let row of playedTracks) {
        if (!stats[row.group_id]) {
            stats[row.group_id] = { members: {}, genres: {} };
        }
        const group = stats[row.group_id];

        if (!group.members[row.user_id]) {
            group.members[row.user_id] = 0;
        }
        if (row.genre === null) {
            continue;
        }

        if (!group.genres[row.genre]) {
            group.genres[row.genre] = { tracks: {}, plays: 0, playsPerMember: {} };
        }
        const genre = group.genres[row.genre];
        if (!genre.playsPerMember[row.user_id]) {
            genre.playsPerMember[row.user_id] = 0;
        }
        if (!genre.tracks[row.track_id]) {
            genre.tracks[row.track_id] = { plays: [] }
        }
        const track = genre.tracks[row.track_id];
        group.members[row.user_id] += Number(row.plays);
        genre.plays += Number(row.plays);
        genre.playsPerMember[row.user_id] += Number(row.plays);
        track.plays.push({ user: row.user_id, plays: Number(row.plays) });
    }

    return stats;
}

function transformGroupedDataToLists(stats: Groups): GroupListItem[] {
    const result: GroupListItem[] = [];
    for (let groupId in stats) {
        const group = stats[groupId];
        const groupItem: GroupListItem = { id: groupId, genres: [], all_tracks: [], members: Object.keys(group.members) };
        result.push(groupItem);

        for (let genreName in group.genres) {
            const genre = group.genres[genreName];
            const genreItem: GenreListItem = { name: genreName, tracks: [], score: 0 };
            groupItem.genres.push(genreItem);

            for (let trackId in genre.tracks) {
                const track = genre.tracks[trackId];
                const trackItem: ScoredTrack = { id: trackId, plays: track.plays, score: getTrackScore(group, track) };

                genreItem.tracks.push(trackItem);
                groupItem.all_tracks.push(trackItem);
            }

            sortByScore(genreItem.tracks);
            genreItem.score = getGenreScore(groupItem, genreItem.tracks)
        }

        sortByScore(groupItem.all_tracks);
    }

    return result;
}

function getGenreScore(group: GroupListItem, tracks: ScoredTrack[]) {
    var sum = tracks.reduce((sum, track) => sum + track.score, 0);
    return sum / group.members.length;
}

function computePlaylists(data: GroupListItem[]) {
    const statsNew: Playlist[] = [];
    for (let group of data) {
        statsNew.push({ groupId: group.id, name: `Top ${topX}`, score: 1, tracks: group.all_tracks.slice(0, topX) });

        for (let genre of group.genres) {
            statsNew.push({ groupId: group.id, name: genre.name, score: genre.score, tracks: genre.tracks.slice(0, tracksPerGenreToplist) });
        }
    }
    return statsNew;
}

function getTrackScore(group: Group, track: Track) {
    return track.plays.map((trackPlays) => {
        const totalPlays = group.members[trackPlays.user];
        return trackPlays.plays / totalPlays;
    }).reduce((sum, score) => sum + score, 0);
}

function sortByScore(tracks: ScoredTrack[]) {
    return tracks.sort((a, b) => b.score - a.score);
}

async function createPlaylist(playlist: Playlist) {
    await prisma.playlists.create({
        data: {
            name: playlist.name,
            is_current_top_list: true,
            score: playlist.score,
            group_id: playlist.groupId,
            playlist_items: {
                createMany: {
                    data: playlist.tracks.map((track) => {
                        return {
                            track_id: track.id,
                            number_of_plays: track.plays.reduce((sum, userPlays) => sum + userPlays.plays, 0),
                            number_of_unique_listeners: track.plays.length,
                            score: track.score
                        }
                    })
                }
            }
        }
    });
}

function fetchPlayedTracksLast7days(): Promise<PlayedTrack[]> {
    return prisma.$queryRaw<PlayedTrack[]>`
    SELECT 
          g.id              AS group_id
        , u.id              AS user_id
        , t.id              AS track_id
        , t.genre           AS genre 
        , count(p.track_id) AS plays
    FROM       groups        g 
    INNER JOIN group_members m ON m.group_id = g.id
    INNER JOIN users         u ON u.id = m.user_id
    LEFT  JOIN played_tracks p ON p.user_id = u.id
    LEFT  JOIN tracks        t ON t.id = p.track_id
    WHERE p.track_id is null 
        or (m.entered_at <= p.played_at 
            and p.played_at >= (current_timestamp() - interval '7 days')
            and t.genre is not null)
    GROUP BY 
          g.id
        , u.id
        , t.id
        , t.genre
 `;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

type PlayedTrack = {
    group_id: string;
    user_id: string;
    track_id: string;
    genre: string;
    plays: number;
}

type Groups = {
    [key: string]: Group;
}

type Group = {
    members: { [key: string]: number };
    genres: { [key: string]: Genre }
}

type Genre = {
    tracks: { [key: string]: Track };
    plays: number;
    playsPerMember: { [key: string]: number };
}

type Track = {
    plays: Plays[];
}

type Plays = {
    user: string;
    plays: number;
}

type GroupListItem = {
    id: string;
    members: string[];
    genres: GenreListItem[];
    all_tracks: ScoredTrack[];
}

type GenreListItem = {
    name: string;
    tracks: ScoredTrack[];
    score: number;
}

type ScoredTrack = {
    id: string;
    plays: Plays[];
    score: number;
}

type Playlist = {
    groupId: string;
    name: string;
    score: number;
    tracks: ScoredTrack[];
}
