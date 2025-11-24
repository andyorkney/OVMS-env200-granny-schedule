#!/bin/bash
#
# OVMS Syntax Validation Script
# Run this before committing to catch common OVMS/Duktape issues
#
# Usage: ./validate-ovms-syntax.sh
#

set -e

echo "=================================="
echo "OVMS Syntax Validation"
echo "=================================="
echo ""

ERRORS=0

# Function to check a file
check_file() {
    local file=$1
    local issues=0

    echo "Checking: $file"

    # Check 1: Node.js syntax validation
    if ! node -c "$file" 2>&1; then
        echo "  [ERROR] Node.js syntax check failed"
        ((issues++))
    else
        echo "  [OK] Node.js syntax valid"
    fi

    # Check 2: Look for unquoted script eval in comments/docs
    # Pattern: "script eval" followed by function call without surrounding quotes
    if grep -n "script eval [a-zA-Z_]" "$file" | grep -v "script eval \"" | grep -v "script eval '" | grep -v "^[0-9]*:[[:space:]]*//"; then
        echo "  [WARNING] Found 'script eval' without quotes (check if it's in a comment/doc)"
        echo "    Should be: script eval \"function()\""
        ((issues++))
    fi

    # Check 3: Look for escaped double quotes in double-quoted strings (Duktape issue)
    if grep -n 'print(".*\\".*")' "$file"; then
        echo "  [ERROR] Found escaped double quotes in double-quoted string"
        echo "    This fails in Duktape! Use single quotes: print('string with \"quotes\"')"
        ((issues++))
    fi

    # Check 4: Look for unquoted examples in comments
    # Lines with charging. or require. that look like examples but aren't quoted
    if grep -n "^ \* .*\(charging\|require\)\." "$file" | grep -v "script eval \"" | grep -v "script eval '"; then
        echo "  [WARNING] Found function examples in comments without script eval wrapper"
        echo "    In documentation, should be: script eval \"function()\""
    fi

    if [ $issues -eq 0 ]; then
        echo "  [OK] All checks passed"
    else
        ((ERRORS+=$issues))
    fi
    echo ""
}

# Check all JavaScript files
for file in charging.js setup-events.js; do
    if [ -f "$file" ]; then
        check_file "$file"
    else
        echo "[WARNING] File not found: $file"
        echo ""
    fi
done

echo "=================================="
if [ $ERRORS -eq 0 ]; then
    echo "✓ All validation checks passed!"
    echo "=================================="
    exit 0
else
    echo "✗ Found $ERRORS issue(s)"
    echo "=================================="
    echo ""
    echo "Please fix the issues above before committing."
    echo "See OVMS-GUIDELINES.md for proper syntax."
    exit 1
fi
