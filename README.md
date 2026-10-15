## Troubleshooting

### 1. Port 8080 Already in Use

Check which process is using port `8080`:

```powershell
netstat -ano | findstr :8080
```

Identify the process using its PID:

```powershell
tasklist /FI "PID eq YOUR_PID"
```

If it is the unused `Tomcat11` service, stop it from Administrator PowerShell:

```powershell
Stop-Service -Name Tomcat11
```

If it is a confirmed unused process, terminate it using its PID:

```powershell
taskkill /PID YOUR_PID /F
```

Verify that port `8080` is free:

```powershell
netstat -ano | findstr :8080
```

Restart the backend:

```powershell
cd C:\Users\Badhrinarayanan\Desktop\Fintrack\backend
mvn spring-boot:run
```

**Note:** Do not terminate an unfamiliar process. Stop only processes you know are safe to close.

### 2. Database Connection Failed

- Ensure the SSH tunnel is running.
- Verify MySQL is running on Oracle Cloud.
- Check the database credentials and port `3307`.

### 3. Frontend Cannot Connect

Ensure the backend is running on port `8080` and the frontend API URL is correct.

### 4. Maven Compilation Failed

Check Java 17 and Lombok configuration.