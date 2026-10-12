# Orvia for Android

The owner's app: connect a phone number to Orvia with carrier call forwarding,
then follow calls, bookings and follow-ups.

- Architecture, security, carrier notes, build, release: [docs/ANDROID.md](../docs/ANDROID.md)
- Testing against a local backend: [e2e/README.md](e2e/README.md)

```bash
cp env.example.json env.json   # project URL and publishable key
flutter pub get
flutter run --flavor dev --dart-define-from-file=env.json
flutter test
```
