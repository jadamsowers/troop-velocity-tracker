# Velocity Tracker - Task List

## Layout Changes

- [ ] Update card title to single line layout:
  - [ ] Add checkbox component
  - [ ] Add email button
  - [ ] Display scout name
  - [ ] Show age and time remaining
  - [ ] Display rank
  - [ ] Show status (middle spaced between left and right content)
  - [ ] Display merit badges (right justified)
  - [ ] Implement responsive collapse for mobile widths
- [ ] Change troop status text to troop number display

## Architectural Changes

- [ ] Apply descriptive divs throughout codebase for better styling
- [ ] Implement theme system:
  - [ ] Create base theme structure
  - [ ] Add light/dark mode toggle
  - [ ] Store user preference
- [ ] Apply official BSA scouting colors:
  - [ ] Define color palette constants
  - [ ] Update CSS variables
  - [ ] Replace existing colors throughout app

## Bug Fixes & Improvements

- [x] scouts who are 12+ and have no rank yet should be in the yellow condition with a reminder for them to start earning ranks
- [x] any scout who is 17+ and not yet at eagle should be in the red condition
- [x] if the API provides nicknames, prefer that name to the actual first name

---
*Last updated: 2026-03-29*
