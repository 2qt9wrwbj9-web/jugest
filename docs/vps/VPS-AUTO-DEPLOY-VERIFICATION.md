# JUGEST VPS Auto Deploy Verification

Date: 2026-09-10

## Verified implementation

- Branch: `sol/vps-auto-deploy`
- Tested commit: `8982c85ed0dd0575e20c3dfbe427d03bd9bf0a8b`
- GitHub Actions run: `34441070245`
- Job: `102756044255`
- Runner OS: Ubuntu 24.04
- Node: `v22.23.2`
- npm: `10.9.8`
- Result: 64 tests, 64 pass, 0 fail

The immediately following commit only removes the temporary verification workflow. `8982c85... -> 3132fb96...` was compared through the GitHub API and the only changed path was `.github/workflows/vps-auto-deploy-verification.yml` (removed). No runtime or test code changed in that transition.

## Scope verification

Base: `e228207854b7720fcb43d6972e832b411cd2c223` (`sol/vps-web-foundation`)

Auto-deploy changes are limited to:

- design / implementation-plan / verification docs
- `vps/package.json` deploy command entries
- auto-deploy core and runner
- auto-deploy CLI/status/installer scripts
- auto-deploy systemd service/timer
- auto-deploy tests

No protected judgement, ranking, Calibration, store-share, Juggler/HANA judgement, HANA hard-constraint, single-evidence, or store-analysis implementation file is changed by this feature.

## Safety behavior verified by tests

- already-current SHA is skipped
- same failed SHA is suppressed
- checkout SHA mismatch is rejected before switching
- failed `npm test` cannot change current release
- successful release switches atomically and restarts web service
- mandatory post-switch health failure rolls back to previous release
- release cleanup protects current and previous releases
- installer verifies existing current release before migration
- installer is re-runnable after migration
- installer does not enable the timer
- timer is configured for roughly one-minute polling and only the `deploy/vps` ref is targeted

## Production activation gate

Repository implementation and deploy branch preparation do not enable the KAGOYA VPS timer. `systemctl enable --now jugest-deploy.timer` must not be executed until Hiro explicitly approves activation after Stage A installation/status verification.
