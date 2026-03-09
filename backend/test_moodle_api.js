require('dotenv').config();
const { login, getEnrolledCourses, getFormattedAssignments, getSiteInfo } = require('./moodle.js');

async function runTests() {
  console.log("==================================================");
  console.log("🚀 STARTING MOODLE API TESTS");
  console.log("==================================================");
  
  try {
    // 1. Test Connection & Login
    console.log("\n[TEST 1/4] Establishing Connection & Login...");
    const session = await login();
    console.log("✅ Login Successful!");
    console.log(`Cookie Count: ${session.cookies.length}, SessKey: ${session.sesskey}, UserID: ${session.userid}`);
    
    // 2. Test Site Info
    console.log("\n[TEST 2/4] Fetching Site Information...");
    const siteInfo = await getSiteInfo();
    console.log("✅ Site Info Fetched!");
    console.log(siteInfo);
    
    // 3. Test Enrolled Courses
    console.log("\n[TEST 3/4] Fetching Enrolled Courses...");
    const courses = await getEnrolledCourses();
    console.log(`✅ Fetched ${courses.length} courses successfully!`);
    
    // 4. Test Assignments Scraper
    console.log("\n[TEST 4/4] Fetching and Formatting Assignments...");
    const assignments = await getFormattedAssignments();
    console.log(`✅ Fetched ${assignments.length} assignments across all courses.`);
    if (assignments.length > 0) {
      console.log("\nSample Assignment:");
      console.log(assignments[0]);
    }
    
    console.log("\n==================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");

  } catch (err) {
    console.error("\n==================================================");
    console.error("❌ TEST FAILED!");
    console.error("Error Message:", err.message);
    console.error("Stack Trace:", err.stack);
    console.error("==================================================");
    console.log("\nTROUBLESHOOTING:");
    console.log("- Verify your credentials in the .env file (MOODLE_USERNAME & MOODLE_PASSWORD).");
    console.log("- Try logging into Moodle via web browser to ensure your account isn't locked/requires captcha.");
    console.log("- Note: Moodle Web Services (/login/token.php) are often disabled by university IT for students. The scraper bypasses this by logging in like a regular browser session.");
  }
}

runTests();
