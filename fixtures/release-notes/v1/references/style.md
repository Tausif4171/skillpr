# Style examples

## Features

- Adds a bulk delete action to the bucket browser.
- Rewrites the rebalance progress bar so bytes and objects move together.

## Fixes

- Fixes a stale cache hit when a versioned object is overwritten twice in a minute.
- Fixes replication status showing healthy while the target is unreachable.

## Internal

- Removes the unused S3 gateway shim.
- Upgrades the Postgres driver to 3.4.

## Never write

- "Fixes bug" — say which behaviour changed.
- "Various improvements" — name them or drop them.
- "Refactors X" for a change no user can see.
