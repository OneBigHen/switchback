The navigation session controller is a pure state machine: commands produce an immutable next state plus declarative effects, while callers remain responsible for performing geolocation, wake-lock, reroute, recording, timeout, voice, and journal I/O.

- `GeolocationSubscribe`: start listening for rider position fixes.
- `GeolocationUnsubscribe`: stop listening for rider position fixes.
- `WakeLockAcquire`: request a screen wake lock for active navigation.
- `WakeLockRelease`: release any active screen wake lock.
- `VoiceSpeak`: speak a navigation prompt through the voice layer.
- `RecordingStart`: begin ride recording.
- `RecordingStop`: stop ride recording.
- `JournalHandoff`: hand a finished recording to the ride journal flow.
- `RerouteRequest`: request a reroute using the supplied recovery policy.
- `RerouteCancel`: cancel any active reroute request.
- `ScheduleTimeout`: schedule a tagged controller timeout.
- `ClearTimeout`: clear a tagged controller timeout.
