# Lumina: LMS Event Notifier

Lumina is a full-stack web application that helps students track, manage, and get notified about assignments and campus events. It integrates with the VIT Chennai Moodle LMS to fetch assignments and provides a modern, interactive dashboard for event management and deadline tracking.

---

## Features

### Frontend (React)
- **Dashboard Overview:** Visual summary of assignment completion and upcoming events.
- **Assignment & Event Management:** Add, view, and delete assignments or campus events.
- **Category Filtering:** Filter events by type (Assignment, Health, Club, Finance, Other).
- **Moodle Sync:** One-click sync to import assignments from VIT Chennai LMS.
- **Smart Notifications:** Browser notifications for upcoming deadlines (within 60 minutes).
- **Modern UI:** Responsive, glassmorphic design with dark mode aesthetics.

### Backend (Node.js/Express)
- **REST API:** CRUD endpoints for events and notification toggling.
- **Moodle Integration:** Securely logs in and scrapes assignments/courses from VIT Chennai LMS using session-based scraping and AJAX APIs.
- **In-memory DB:** Easily swappable for persistent storage (e.g., SQLite, Postgres).
- **Environment Config:** Uses `.env` for sensitive credentials and Moodle URL.

---

## Project Structure

```
backend/
  index.js            # Express server, event API, Moodle routes
  moodle.js           # Moodle LMS integration (login, scraping, AJAX)
  moodleRoutes.js     # Express routes for Moodle endpoints
  .env.example        # Example environment variables
frontend/
  src/App.jsx         # Main React app (UI, logic, notifications)
  public/index.html   # HTML entry point
package.json          # Project metadata (root, backend, frontend)
```

---

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm or yarn

### 1. Clone the Repository
```
git clone <your-repo-url>
cd event-notifier-main
```

### 2. Backend Setup
```
cd backend
cp .env.example .env   # Fill in your VIT Moodle credentials
npm install
npm run dev            # Starts backend on http://localhost:3001
```

#### `.env` Example
```
MOODLE_URL=https://lms.vit.ac.in
MOODLE_USERNAME=your_vit_id
MOODLE_PASSWORD=your_password
PORT=3001
```

### 3. Frontend Setup
```
cd ../frontend
npm install
npm start              # Starts frontend on http://localhost:3000
```

---

## Usage
- **Sync Assignments:** Click "Sync Moodle Assignments" to import deadlines from LMS.
- **Add Events:** Use "Create Manual Event" for campus or personal events.
- **Notifications:** Enable browser notifications for deadline alerts.
- **Filter & Track:** Use tabs and filters to view assignments or events by category.

---

## API Endpoints

### Event API
- `GET    /events`           – List all events (sorted by date/time)
- `POST   /events`           – Add a new event
- `PATCH  /events/:id/notify`– Toggle notification for an event
- `DELETE /events/:id`       – Delete an event

### Moodle API
- `GET    /moodle/ping`         – Test login, get user info
- `GET    /moodle/courses`      – List enrolled courses
- `GET    /moodle/assignments`  – List all assignments (title, subject, deadline, instructions)
- `POST   /moodle/logout`       – Clear session (force re-login)

---

## Customization & Extensibility
- **Database:** Swap in a persistent DB (e.g., SQLite, Postgres) for production use.
- **LMS Integration:** Adapt `moodle.js` for other Moodle-based institutions.
- **UI Themes:** Modify `App.jsx` styles for branding or light mode.

---

## License
MIT License. See LICENSE for details.

---

## Credits
- Built with [React](https://reactjs.org/), [Express](https://expressjs.com/), and [Cheerio](https://cheerio.js.org/).
- LMS scraping logic tailored for VIT Chennai Moodle.

---

## Troubleshooting
- **Moodle Login Fails:** Double-check `.env` credentials and network access to LMS.
- **Notifications Not Working:** Ensure browser permissions are granted.
- **Port Conflicts:** Change `PORT` in `.env` or frontend `package.json` proxy.

---

## Contributors
- Hirthick Srinivaasan
