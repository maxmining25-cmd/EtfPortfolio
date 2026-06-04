import os
import sys
import time
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = r"c:\Users\MMonakhov\Documents\ChatAI\EtfPortfolio\screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def run_tests():
    print("Starting Playwright automation script...")
    with sync_playwright() as p:
        # Launch Chromium headless
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        # Enable console logging
        page.on("console", lambda msg: print(f"[Browser Console] {msg.type}: {msg.text}"))
        
        # Navigate to application local URL
        print("Navigating to http://localhost:3000...")
        page.goto("http://localhost:3000")
        page.wait_for_load_state("networkidle")
        
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "1_login_page.png"))
        print("Login page screenshot saved.")
        
        # 1. Test Demo Sign In
        print("Attempting to sign in using Explore in Demo Mode...")
        demo_btn = page.locator("text=Explore in Demo Mode")
        if demo_btn.count() > 0:
            demo_btn.click()
        else:
            # Fallback to signing in with demo credentials if OTP button is not found
            print("Demo button not found. Using credentials.")
            page.locator("button:has-text('Standard User')").click()
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "1b_credentials_filled.png"))
            page.locator("button[type='submit']").click()
            
        page.wait_for_timeout(3000) # Wait for animation/redirect
        page.wait_for_load_state("networkidle")
        
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "2_dashboard_home.png"))
        print("Dashboard loaded successfully.")
        
        # Verify page title/content
        if "AURAWEALTH" not in page.content() and "Ray Dalio" not in page.content():
            print("Error: Dashboard header not found or mismatch.")
            sys.exit(1)
            
        # 2. Test Sandbox Interactions
        print("Interacting with Sandbox Auto-Scale toggle...")
        auto_scale_btn = page.locator("button:has-text('Auto-Scale')")
        if auto_scale_btn.count() > 0:
            # Check active state
            btn_class = auto_scale_btn.get_attribute("class") or ""
            print("Auto-Scale button active status before click:", "active" if "indigo" in btn_class else "inactive")
            auto_scale_btn.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "3_sandbox_autoscale_toggled.png"))
            # Toggle it back
            auto_scale_btn.click()
            page.wait_for_timeout(500)
        
        # 3. Test Sandbox Asset Lock and weight optimization
        print("Testing weight optimizer...")
        equal_weight_btn = page.locator("button:has-text('Equal Weight')")
        if equal_weight_btn.count() > 0:
            equal_weight_btn.click()
            print("Clicked Equal Weight optimizer button.")
            page.wait_for_timeout(2000) # Wait for solver output
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "4_after_equal_weight_opt.png"))
            
        # Verify if BITO last data upload date badge is visible
        print("Checking if asset last quote upload date badges are visible...")
        last_date_badges = page.locator("span:has-text('Last:')")
        if last_date_badges.count() > 0:
            print(f"Success: Found {last_date_badges.count()} 'Last:' date badges for assets.")
            for i in range(min(3, last_date_badges.count())):
                print(f"Badge {i+1} Text: {last_date_badges.nth(i).inner_text()}")
        else:
            print("Warning: No 'Last:' date badges found next to assets. (This may be expected if quotes aren't loaded in DB yet).")

        # 4. Sign Out
        print("Signing out standard account...")
        sign_out_btn = page.locator("button[aria-label='Sign Out']")
        if sign_out_btn.count() > 0:
            sign_out_btn.click()
            page.wait_for_timeout(2000)
            page.wait_for_load_state("networkidle")
        else:
            print("Error: Sign Out button not found.")
            sys.exit(1)
            
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "5_after_signout.png"))
        print("Signed out. Returned to login page.")
        
        # 5. Log in as Admin to test Admin Panel functions
        print("Signing in as Admin user...")
        admin_creds_btn = page.locator("button:has-text('Admin Role')")
        if admin_creds_btn.count() > 0:
            admin_creds_btn.click()
            page.wait_for_timeout(500)
            page.locator("button[type='submit']").click()
            page.wait_for_timeout(3000)
            page.wait_for_load_state("networkidle")
        else:
            print("Error: Admin Role credential helper button not found.")
            sys.exit(1)
            
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "6_admin_dashboard_home.png"))
        print("Admin user logged in.")
        
        # 6. Open Admin Control Panel
        print("Opening Admin Control Panel...")
        admin_panel_btn = page.locator("button:has-text('Admin Control Panel')")
        if admin_panel_btn.count() > 0:
            admin_panel_btn.click()
            page.wait_for_timeout(2000)
            page.wait_for_load_state("networkidle")
        else:
            print("Error: Admin Control Panel navigation button not found.")
            sys.exit(1)
            
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "7_admin_panel_users_tab.png"))
        print("Admin Panel loaded. Currently on Users tab.")
        
        # 7. Switch to EOD Quotes Tab
        print("Switching to EOD Quotes tab...")
        quotes_tab_btn = page.locator("button:has-text('EOD Quotes')")
        if quotes_tab_btn.count() > 0:
            quotes_tab_btn.click()
            page.wait_for_timeout(2000)
            page.wait_for_load_state("networkidle")
        else:
            print("Quotes tab button not found. Searching for tab navigation...")
            page.locator("text=EOD Quotes").click()
            page.wait_for_timeout(2000)
            
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "8_admin_panel_quotes_tab.png"))
        print("Currently on EOD Quotes tab.")
        
        # 8. Load quotes for a ticker to test sliced table (last 20 rows)
        print("Searching for SPY quotes to load...")
        page.locator("input[placeholder*='Enter ticker to search']").fill("SPY")
        page.wait_for_timeout(500)
        
        load_quotes_btn = page.locator("button:has-text('Load Quotes')")
        if load_quotes_btn.count() > 0:
            load_quotes_btn.click()
            print("Clicked Load Quotes button.")
            page.wait_for_timeout(3000) # Wait for quotes to fetch
            page.wait_for_load_state("networkidle")
        
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "9_admin_panel_quotes_loaded.png"))
        
        # 9. Verify limit to last 20 rows and header hint
        print("Verifying EOD quotes table limit and header hint...")
        table_rows = page.locator("table tbody tr")
        print(f"Table row count: {table_rows.count()}")
        
        header_hint = page.locator("th:has-text('Ticker')")
        hint_text = header_hint.inner_text() if header_hint.count() > 0 else ""
        print(f"Header cell text (contains hint): '{hint_text}'")
        
        if table_rows.count() > 20:
            print(f"Error: Table displays {table_rows.count()} rows, which exceeds the limit of 20!")
            sys.exit(1)
        else:
            print(f"Success: Table row count is {table_rows.count()} (<= 20).")
            
        if "showing last" not in hint_text.lower():
            print("Error: Table header hint is missing or not formatted correctly!")
            sys.exit(1)
        else:
            print("Success: Table header hint is displayed correctly.")
            
        # 10. Check the select all checkbox behavior
        print("Testing select-all checkbox...")
        select_all_cb = page.locator("table thead input[type='checkbox']")
        if select_all_cb.count() > 0:
            select_all_cb.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_admin_quotes_selected_all.png"))
            
            row_checkboxes = page.locator("table tbody input[type='checkbox']")
            checked_count = 0
            for i in range(row_checkboxes.count()):
                if row_checkboxes.nth(i).is_checked():
                    checked_count += 1
            print(f"Checked checkboxes in body: {checked_count} of {row_checkboxes.count()}")
            
            if checked_count != min(20, table_rows.count()):
                print("Error: Select All checked a different number of rows than expected!")
                sys.exit(1)
            else:
                print("Success: Select All successfully selected only the visible rows.")
                
            # Uncheck
            select_all_cb.click()
            page.wait_for_timeout(500)
            
        # 11. Go back to dashboard and sign out
        print("Returning to dashboard...")
        back_btn = page.locator("button:has-text('Back to Dashboard')")
        if back_btn.count() > 0:
            back_btn.click()
            page.wait_for_timeout(2000)
            page.wait_for_load_state("networkidle")
            
        sign_out_btn = page.locator("button[aria-label='Sign Out']")
        if sign_out_btn.count() > 0:
            sign_out_btn.click()
            page.wait_for_timeout(1500)
            
        print("Testing finished successfully!")
        browser.close()

if __name__ == "__main__":
    run_tests()
