# Media Vault

A lightweight local-first web application for managing movies, series, and general videos on a PC without duplicating media files.

## Goals

- Manage movies, series episodes, and videos in one place
- Tag media by company, actor, categories, sub-categories, and custom tags
- Keep only one real copy of each media file
- Support nested source folders
- Optionally organize files into a managed library
- Generate preview thumbnails and short clips
- Play in browser or open directly in VLC
- Stay lightweight enough for a low-resource host machine
- Be expandable later for LAN access and streaming from other PCs

## Core Principles

1. The database is the source of truth
2. Each video has one canonical file path
3. Filesystem category views are generated projections, not the main data model
4. The host machine stores all state locally
5. The app must run as a lightweight web server with a browser-based UI

## Stack

- Backend: Go
- Frontend: React + Vite + TypeScript
- Database: SQLite
- Media metadata: ffprobe
- Preview generation: ffmpeg

## Main Features

- Recursive scanning of source folders
- Unified library for:
  - Movies
  - Series Episodes
  - General Videos
- Tagging:
  - Company
  - Actors / Performers
  - Main Categories
  - Sub Categories
  - Free Tags
- Series support:
  - Series
  - Season
  - Episode Number
  - Optional Absolute Order
- Preview support:
  - Thumbnail strip
  - Short preview clips
- Playback:
  - In-browser playback
  - Open directly in VLC
- File actions:
  - Reveal in folder
  - Rebuild generated views
- Settings:
  - Source folders
  - Destination library
  - Preview cache
  - VLC path

## Storage Model

The application avoids duplicate media files.

Each media item has:
- one canonical file path
- metadata stored in SQLite
- many relationships in the database:
  - company
  - actors
  - categories
  - tags
  - series linkage

Generated folder views may be created for browsing by:
- company
- actor
- category
- series

## Modes

### Reference Mode
The app indexes files in place without moving them.

### Managed Mode
The app moves files into a canonical library structure and generates browsing views.

## Future Expansion

Planned later:
- LAN access from other PCs
- authenticated multi-user access
- network streaming
- resume positions / watch history
- import/export metadata bundles
- smarter duplicate detection
- bulk tagging tools

## MVP Roadmap

### Phase 1
- Project setup
- SQLite schema
- Recursive scan
- Library listing
- Media detail page
- Basic tagging
- Dark UI foundation

### Phase 2
- Preview strip generation
- On-demand preview clips
- VLC opening
- Generated folder views
- Series manager

### Phase 3
- Bulk actions
- Search improvements
- Scan conflict handling
- Safer move/rename workflows

### Phase 4
- LAN mode
- Authentication
- Remote playback and streaming

## Non-Goals For Initial Version

- Multi-user remote access
- Cloud sync
- Heavy background transcoding
- Full media server features
- Advanced recommendation system