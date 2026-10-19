# DevShip 2.0: dependable setup and GitHub Releases

Distribution: public MIT source and release assets in LatipovYusuf444/devship. No user project, credential, Telegram outbox or local settings are published.

The default update policy is a terminal notice on a normal interactive run, cached for 24 hours. `ds update` downloads and verifies a stable GitHub Release and installs it with npm lifecycle scripts disabled. Help, version and dry-run never use the network. Offline notice checks do not block Git. Updates do not occur in the middle of shipping. There is no background service or silent automatic replacement: the user's alternative request for an update notice is the default, with one command to apply it.

Releases contain a fixed-name npm tarball, release.json (version, SHA256, bytes) and source ZIP. The updater pins the GitHub repository in installed code, checks HTTPS redirect destinations, bounds responses, validates the tar package's name/version/bin/engine and rejects unsafe archive entries. It verifies checksums before npm, backs up the installed package, serializes updates, and reports rollback failures. Running CLI instances use a shared installation gate so an update cannot overlap shipping.

Ambiguous package managers require an explicit choice through `ds setup`; it is saved outside Git for this machine/project, tied to packageManager and lockfile presence. No lockfile is removed. Explicit checks keep precedence. Automatic Node tasks include type checks, test or test:unit, and build. Only trusted project scripts are run. `ds doctor` reports local readiness without staging, committing or pushing.

Repository locks retain active/unknown owners. Locks written by this version can recover a confirmed-dead same-host PID through an exclusive recovery gate; unknown and legacy locks require manual inspection. Cleanup checks the ownership token. No Git reset, clean, stash, rebase or force push is added.

Telegram prompts remain visible while token input stays hidden. Setup can reuse a saved token. Health reports membership/permissions without sending a message. Only Telegram's explicit migration metadata may repair a migrated group; names never establish identity. Known API failures receive safe specific guidance, never raw token-bearing responses.

Git guarantees remain unchanged: stop on failed checks/conflicts, preserve local work, merge incoming refs into the feature branch, and push only that branch. Safety scanners remain heuristic, and project checks/hooks can have side effects.
