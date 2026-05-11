# Phase 19 Home Entry Screen

## Summary

The root route now shows a public home screen before the authenticated dashboard.

Previous flow:

```text
/ -> /dashboard
```

Current flow:

```text
/ -> Home -> /dashboard
```

## Route Behavior

- `/` renders `Home`.
- `/dashboard` remains inside `RequireAuth` and `AppLayout`.
- The authenticated app sidebar brand mark links back to `/`.
- The primary CTA on the home screen links to `/dashboard`.
- If the user is not authenticated, `/dashboard` still redirects to `/login` through the existing auth guard.

## Home Screen Content

- Service positioning: field risk and daily work decision support.
- Premium landing-style structure with fixed pill navigation, full-screen snap sections, and an autoplaying muted browser-compatible H.264 farmland drone loop.
- Workflow summary: field registration, risk review, work execution.
- The workflow section footer displays contest organizer names as a single-line scrolling marquee without a separate "주최 기관" label.
- Feature modules: risk signal integration, photo diagnosis, work/consultation flow.
- Feature module headers omit decorative icon badges and rely on text labels over the card imagery.
- Dashboard preview: risk score, weather/status signals, pest candidates, and field basis.
- Hero risk signal card calls the existing KMA live weather service with Seoul City Hall coordinates (`37.5665`, `126.978`) and displays Seoul precipitation, temperature, wind, and humidity status.
- Dark final CTA section uses the headline "미래 농업의 기준, 지금 경험하세요." and links back into `/dashboard`.

## Verification

- `src/pages/Home.test.tsx` verifies service introduction text, the `/dashboard` CTA, and Seoul weather API data placement in the hero risk signal.
