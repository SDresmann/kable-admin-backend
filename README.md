# Kable Career Admin Backend

Backend server for the Kable Career Admin application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the backend directory with your MongoDB connection string:
```
ATLAS_URI="mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority"
PORT=5001
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Students
- `GET /api/students` - Get all students/users
- `GET /api/students/:id` - Get a single student by ID

## Notes

- The server runs on port 5001 by default (or the port specified in `.env`)
- Make sure your MongoDB database contains a `users` collection
- The password field is excluded from API responses for security
