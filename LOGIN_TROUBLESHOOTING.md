# Login Error Troubleshooting Guide

## Recent Improvements

I've enhanced the error handling in the login page to provide clearer error messages. The errors are now logged to the browser console with detailed information.

## Common Login Errors

### 1. "Unable to connect to server" or "Network error"

**Possible Causes:**
- API server is not running
- Wrong API URL configured
- CORS issues
- Firewall blocking the connection

**Solutions:**
1. Check if your API server is running on `http://localhost:3050`
2. Verify the API URL in your `.env.local` file:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3050/api
   ```
3. Check browser console (F12) for detailed error messages
4. Test the API endpoint directly in your browser or Postman:
   ```
   POST http://localhost:3050/api/auth/login
   Content-Type: application/json
   
   {
     "username": "superadmin",
     "password": "admin123"
   }
   ```

### 2. "Invalid username or password" (401 Error)

**Possible Causes:**
- Wrong credentials
- User account is inactive
- Password is incorrect

**Solutions:**
1. Verify your credentials match what's in the database
2. Check if the user account is active
3. Try the default superadmin credentials:
   - Username: `superadmin`
   - Password: `admin123`

### 3. "Invalid response from server" or JSON parsing errors

**Possible Causes:**
- API is returning non-JSON response
- API endpoint path is incorrect
- Server error (500)

**Solutions:**
1. Check browser Network tab (F12) to see the actual response
2. Verify the API endpoint path is `/api/auth/login`
3. Check server logs for errors

### 4. CORS Errors

**Symptoms:**
- Console shows "CORS policy" errors
- Request fails in browser but works in Postman

**Solutions:**
1. Ensure your API server has CORS enabled
2. Check CORS configuration allows requests from your frontend origin
3. Common CORS setup:
   ```javascript
   app.use(cors({
     origin: 'http://localhost:3000', // Your Next.js dev server port (usually 3000)
     credentials: true
   }))
   ```

## Debugging Steps

1. **Open Browser Console (F12)**
   - Check for any error messages
   - Look for the "Login error details" log which shows:
     - Error object
     - Error name
     - Error message
     - Status code
     - Response data

2. **Check Network Tab (F12 → Network)**
   - Find the login request (`/auth/login`)
   - Check the request URL
   - Check the request payload
   - Check the response status and body

3. **Verify API Server**
   ```bash
   # Test if API server is running
   curl http://localhost:3050/api/auth/login \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"username":"superadmin","password":"admin123"}'
   ```

4. **Check Environment Variables**
   - Verify `.env.local` exists in project root
   - Restart Next.js dev server after changing `.env.local`
   - Next.js only reads env vars on server start

## Quick Checks

✅ Is the API server running?
```bash
# Check if port 3001 is in use
lsof -i :3001
```

✅ Is the API URL correct?
- Open browser console
- You should see: `API URL: http://localhost:3050/api`

✅ Are credentials correct?
- Try default: `superadmin` / `admin123`
- Or check your database

✅ Is CORS configured?
- Try the login request in Postman
- If Postman works but browser doesn't, it's likely CORS

## Getting Help

If you're still experiencing issues:

1. Check the browser console for the full error details
2. Check the Network tab for the request/response
3. Share the error message you see on the login page
4. Share the console error details (from "Login error details" log)

The improved error handling should now show you exactly what's wrong!

