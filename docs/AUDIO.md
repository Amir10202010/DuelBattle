# Game audio

The landing and sign-in pages stay silent. Entering the game hub, store, profile,
lobby or battle activates music and effects automatically where autoplay is allowed.
Blocked playback retries on completed touches, clicks and key presses inside the game.
There is no separate start screen or large audio button.

The compact speaker in the game header mutes/unmutes all audio. Settings also offers
music volume and separate music control. Saved choices stay on this device; existing
mute settings are preserved. A player who muted an earlier version can use the speaker
to enable audio again. Returning to the landing silences both channels.

“Room for Two” is an original sixteen-bar instrumental score implemented in
`packages/client/src/media/music.ts`: 108 BPM, plucked melody, soft chords, bass
and percussion. No audio downloads, external services or third-party tracks.
The battle arrangement adds rhythm on the next bar without restarting the song.
Countdowns and results lower the music so game effects remain clear.

The music scheduler stops and suspends its audio context in hidden tabs. Notes
disconnect when finished. Background stalls do not replay a backlog of notes.
Playback failures leave gameplay working; Settings shows playback status.

Effects wait for asynchronous audio startup on mobile; expired cues are dropped.
Saved settings describe the player's choice, separately from whether playback
actually started. Blocked starts keep that choice and retry on subsequent gestures.
Completed touches, clicks and key presses retry playback; explicit audio buttons
handle their own gestures. Settings includes **Test sound** and startup status.
Startup promises time out after 1.6 seconds. Where supported, the audio session
requests media playback routing. Older browsers keep their default routing.
Device volume and browser/site audio permissions still apply. Final listening
on actual iOS/Android speakers is a release check; unit tests verify scheduling,
mute, persistence and startup rather than perceived sound quality.
