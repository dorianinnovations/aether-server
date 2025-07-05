#!/bin/bash

# Numina Server Deployment Script
# This script helps deploy the application to various platforms

set -e

echo "🚀 Numina Server Deployment Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to validate environment
validate_env() {
    echo "🔍 Validating environment..."
    
    # Check required files
    if [ ! -f "src/server.js" ]; then
        echo "❌ Error: src/server.js not found"
        exit 1
    fi
    
    if [ ! -f "package.json" ]; then
        echo "❌ Error: package.json not found"
        exit 1
    fi
    
    echo "✅ Environment validation passed"
}

# Function to run tests
run_tests() {
    echo "🧪 Running tests..."
    if npm test; then
        echo "✅ Tests passed"
    else
        echo "❌ Tests failed"
        exit 1
    fi
}

# Function to check security
security_check() {
    echo "🔒 Running security audit..."
    if npm audit --audit-level=moderate; then
        echo "✅ Security audit passed"
    else
        echo "⚠️  Security vulnerabilities found. Please review and fix."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to deploy to Railway
deploy_railway() {
    echo "🚂 Deploying to Railway..."
    
    if ! command_exists railway; then
        echo "📦 Installing Railway CLI..."
        npm install -g @railway/cli
    fi
    
    railway login
    railway up
    echo "✅ Railway deployment initiated"
}

# Function to deploy to Render
deploy_render() {
    echo "🎨 Deploying to Render..."
    echo "Please deploy manually via Render dashboard:"
    echo "1. Go to https://render.com"
    echo "2. Create new Web Service"
    echo "3. Connect your GitHub repository"
    echo "4. Set environment variables"
    echo "5. Deploy"
}

# Function to deploy to Heroku
deploy_heroku() {
    echo "🦸 Deploying to Heroku..."
    
    if ! command_exists heroku; then
        echo "📦 Installing Heroku CLI..."
        curl https://cli-assets.heroku.com/install.sh | sh
    fi
    
    # Check if Heroku app exists
    if ! heroku apps:info >/dev/null 2>&1; then
        echo "📱 Creating Heroku app..."
        heroku create
    fi
    
    # Add MongoDB addon if not exists
    if ! heroku addons:info mongolab >/dev/null 2>&1; then
        echo "🗄️  Adding MongoDB addon..."
        heroku addons:create mongolab:sandbox
    fi
    
    # Deploy
    git add .
    git commit -m "Deploy to Heroku"
    git push heroku main
    
    echo "✅ Heroku deployment completed"
}

# Function to setup environment
setup_env() {
    echo "⚙️  Setting up environment..."
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        echo "📝 Creating .env file..."
        cp env.production.example .env
        echo "⚠️  Please edit .env file with your configuration"
    fi
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm install
    
    echo "✅ Environment setup completed"
}

# Main menu
show_menu() {
    echo ""
    echo "Choose deployment option:"
    echo "1) Setup environment"
    echo "2) Run tests"
    echo "3) Deploy to Railway (Recommended)"
    echo "4) Deploy to Render"
    echo "5) Deploy to Heroku"
    echo "6) Full deployment (Setup + Tests + Railway)"
    echo "7) Exit"
    echo ""
    read -p "Enter your choice (1-7): " choice
}

# Main execution
main() {
    validate_env
    
    case $1 in
        "setup")
            setup_env
            ;;
        "test")
            run_tests
            ;;
        "railway")
            deploy_railway
            ;;
        "render")
            deploy_render
            ;;
        "heroku")
            deploy_heroku
            ;;
        "full")
            setup_env
            run_tests
            security_check
            deploy_railway
            ;;
        *)
            show_menu
            case $choice in
                1) setup_env ;;
                2) run_tests ;;
                3) deploy_railway ;;
                4) deploy_render ;;
                5) deploy_heroku ;;
                6) 
                    setup_env
                    run_tests
                    security_check
                    deploy_railway
                    ;;
                7) echo "👋 Goodbye!"; exit 0 ;;
                *) echo "❌ Invalid choice"; exit 1 ;;
            esac
            ;;
    esac
}

# Run main function with arguments
main "$@" 