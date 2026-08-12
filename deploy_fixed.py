"""Backward-compatible entry point for the hardened deployment script.

Use ``python deploy.py`` for new deployments. This wrapper is retained so
existing automation does not silently keep using the old credential-embedded
implementation.
"""

from deploy import main


if __name__ == "__main__":
    main()
