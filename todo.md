# Velocity Tracker - Task List

## Layout Changes

- [x] Update card title to single line layout:
  - [x] Add checkbox component
  - [x] Add email button
  - [x] Rank emoji
  - [x] Display scout name
  - [x] Show age and time remaining
  - [x] Show status (middle spaced between left and right content)
  - [x] Display merit badges (right justified)
  - [x] Implement responsive collapse for mobile widths
- [x] Change troop status text to troop number display
- [x] add a tan oval behind the emoji rank to simulate the insignia patch

## Architectural Changes

- [x] Apply descriptive divs throughout codebase for better styling
- [x] Implement theme system:
  - [x] Create base theme structure
  - [x] Add light/dark mode toggle
  - [x] Store user preference
- [x] Apply official BSA scouting colors:
  - [x] Define color palette constants
  - [x] Update CSS variables
  - [x] Replace existing colors throughout app

## Bug Fixes & Improvements

- [x] scouts who are 12+ and have no rank yet should be in the yellow condition with a reminder for them to start earning ranks
- [x] any scout who is 17+ and not yet at eagle should be in the red condition
- [x] if the API provides nicknames, prefer that name to the actual first name
- [x] the loading interface makes no sense (about 100 scouts, but it reports loading over 300)

---
*Last updated: 2026-03-29*
