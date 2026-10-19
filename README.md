# Finance Monitoring — Local Startup Guide

This guide explains how to start the website on your Windows computer. Follow the steps in order. Keep the SSH and application terminals open while you use the website.

## Public website

The live website is available at [https://networth.duckdns.org](https://networth.duckdns.org). Use this link when you want to access the deployed application without starting it on your computer.

## Before you start

- Make sure Java 17, Maven, Node.js, and npm are installed.
- Make sure you have access to the project's Oracle Cloud server and database.
- Open PowerShell or the terminal inside IntelliJ/VS Code.

## Start the application

### 1. Start the secure database connection (SSH tunnel)

The tunnel lets your computer reach the remote database securely. In a PowerShell terminal, run the command below after replacing `your-ssh-user` and `your-server-address` with the connection details provided to you:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" -N -L 3307:127.0.0.1:3306 your-ssh-user@your-server-address
```

- Leave this terminal open. It may look like nothing is happening; that is normal.
- Do not press **Ctrl+C** while using the application.
- If the tunnel is already running, do not start another one.

### 2. Start the website (frontend)

Open a second terminal and run:

```powershell
cd frontend
npm install
npm run dev
```

After the first setup, `npm install` is usually not needed again. For normal startup, run:

```powershell
cd frontend
npm run dev
```

Keep this terminal open. The website is normally available at **http://localhost:5173**.

### 3. Check the private settings file

Before starting the backend, make sure this file exists:

`backend/.env`

It must contain the database and token settings below. Replace the example text with the values supplied securely to you. Do not share this file or put real passwords or keys in this README.

```dotenv
PORT=8081
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
JWT_SECRET=replace_with_a_long_random_secret
```

The `.env` file is intended to stay private and is excluded from Git. Never upload it, send it in a screenshot, or commit it to the repository. The backend reads this file when started from the `backend` folder.

### 4. Start the backend (API)

Open a third terminal and run:

```powershell
cd backend
mvn spring-boot:run
```

Keep this terminal open. The backend uses port **8081**. The SSH tunnel from Step 1 must be running before the backend can connect to the database.

### 5. Open the website

Open **http://localhost:5173** in your browser and sign in. The website sends its API requests through the backend automatically.

## Manually test API operations with Swagger Editor

Swagger Editor lets you view the API operations and send test requests. The API description is in `backend/openapi.yaml`.

1. Start the SSH tunnel and both the frontend and backend using Steps 1–4 above.
2. Open [Swagger Editor](https://editor.swagger.io/).
3. In the editor, use **File → Import File** and select `backend/openapi.yaml` from this project. You can also open the file in a text editor and paste its contents into Swagger Editor.
4. In the server selection list, choose `http://localhost:5173` to test your local setup. To send requests to the deployed application instead, choose `https://networth.duckdns.org`.
5. Find **Authentication → POST /api/auth/login**. Select **Try it out**, enter your own account email and password in the example request, then select **Execute**.
6. Copy the `token` value from the successful response. Select **Authorize**, paste the token value (do not add `Bearer` yourself), and confirm. Swagger adds the required prefix for you.
7. For another operation, select **Try it out**, fill in its fields, and select **Execute**. Operations that need sign-in will use the token you authorized.

Use a test account when possible. Requests sent to the public website may affect live data, so use the local setup for testing operations that create, update, or delete information. Do not enter database passwords, the JWT secret, or other private environment settings into Swagger Editor. Only the API request details and your test account credentials should be used for API testing.

## If something does not work

- **Website does not open:** Check that the frontend terminal is still running and visit `http://localhost:5173`.
- **Website cannot reach the API:** Check that the backend is running on port `8081` and the frontend is running on port `5173`.
- **Database connection error:** Check that the SSH tunnel is still open and that `backend/.env` has the correct private database settings. Do not share the values when asking for help.
- **Port 8081 is already in use:** Another application is using the backend port. Close only a program you recognize and know is safe to stop; do not terminate an unfamiliar process.
- **Maven fails to start:** Confirm Java 17 is installed and try running the backend command from the `backend` folder.
- **Swagger request fails:** Confirm the local frontend and backend are both running, select `http://localhost:5173` as the server, and authorize again if the operation requires sign-in.

## Security reminder

Credentials and a signing key were included in the setup information shared while preparing this guide. Treat those values as exposed: change the database password and replace the JWT secret before using them again, then update your private `backend/.env` file. Never put the replacement values in this README.