const TRACK_KIND_AUDIO = 1;

const UNPUBLISH_WAIT_TIMEOUT = 1200;

const pendingUnpublish = new WeakMap<object, Map<string, Promise<void>>>();

export const unpublishStaleAudio = (connection: any) => {
  try {
    const room = connection?.room;
    const participant = room?.localParticipant;

    if (!room?.isConnected || typeof participant?.unpublishTrack !== 'function') return;

    const publications = participant.trackPublications;
    if (!publications || typeof publications.entries !== 'function') return;

    let pending = pendingUnpublish.get(participant);
    if (!pending) {
      pending = new Map();
      pendingUnpublish.set(participant, pending);
    }

    for (const [sid, publication] of publications.entries()) {
      if (publication?.kind !== TRACK_KIND_AUDIO || pending.has(sid)) continue;

      const settle: Promise<void> = Promise.resolve(participant.unpublishTrack(sid, true))
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          if (pending!.get(sid) === settle) pending!.delete(sid);
        });

      pending.set(sid, settle);
    }
  } catch {}
};

export const awaitStaleAudio = async (connection: any) => {
  try {
    const participant = connection?.room?.localParticipant;
    if (!participant) return;

    const pending = pendingUnpublish.get(participant);
    if (!pending || pending.size === 0) return;

    await Promise.race([
      Promise.allSettled([...pending.values()]),
      new Promise<void>((resolve) => setTimeout(resolve, UNPUBLISH_WAIT_TIMEOUT).unref?.()),
    ]);
  } catch {}
};

export const prepareVoice = async (connection: any) => {
  unpublishStaleAudio(connection);
  await awaitStaleAudio(connection);
};

export const releaseVoice = (connection: any) => {
  try {
    connection?.stop();
  } catch {}

  unpublishStaleAudio(connection);
};
