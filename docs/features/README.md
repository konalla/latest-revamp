# Features Documentation

This directory contains comprehensive technical documentation for each feature of the IQniti backend application. Each document explains how the feature works, its technical implementation, important code snippets, and integration points.

## 📚 Documentation Index

### Core Features

1. **[Authentication & Authorization](./01-authentication-and-authorization.md)**
   - JWT token management
   - User registration and login
   - Password reset flow
   - Role-based access control

2. **[User Management](./02-user-management.md)**
   - User profiles and settings
   - Status tracking
   - Work preferences
   - Credits system

3. **[Projects](./03-projects.md)**
   - Project creation and management
   - Subscription limits
   - Workspace/team integration
   - Project statistics

4. **[Tasks](./04-tasks.md)**
   - Task creation with AI classification
   - Signal Layer prioritization
   - Bulk task operations
   - Task completion tracking

5. **[AI Recommendations](./05-ai-recommendations.md)**
   - AI-powered task classification
   - Signal Layer system
   - Cognitive mode classification
   - Scheduling recommendations

### Work Management

6. **[Objectives](./11-objectives.md)**
   - Objective creation and tracking
   - Project-objective relationships
   - Status management

7. **[OKRs](./12-okrs.md)**
   - Objectives and Key Results
   - Progress tracking
   - Confidence scoring
   - Progress history

8. **[Plans](./13-plans.md)**
   - Plan creation
   - Project-objective linking
   - OKR and task organization

### Focus & Productivity

9. **[Focus Planning & Sessions](./14-focus-planning-and-sessions.md)**
   - Focus plan generation
   - Session management
   - WebSocket support
   - Task prioritization

10. **[Cognitive Load Management](./15-cognitive-load-management.md)**
    - Workload tracking
    - Burnout risk assessment
    - Recommendations
    - Recovery management

11. **[Focus Rooms](./17-focus-rooms.md)**
    - Collaborative focus sessions
    - Recurring schedules
    - Room templates
    - Real-time updates

### Collaboration

12. **[Workspaces & Teams](./16-workspaces-and-teams.md)**
    - Workspace creation
    - Team management
    - Role-based access
    - Shared resources

### Subscription & Payments

13. **[Subscriptions & Payments](./06-subscriptions-and-payments.md)**
    - Stripe integration
    - Subscription plans
    - Trial management
    - Payment processing
    - Webhook handling

### Rewards & Referrals

14. **[Referrals](./07-referrals.md)**
    - Origin 1000 program
    - Vanguard 300 program
    - Referral tracking
    - Status assignment

15. **[Wallet & Credits](./09-wallet-and-credits.md)**
    - Coin earning system
    - Transaction tracking
    - Balance management
    - Lifetime earnings

16. **[Redemption](./10-redemption.md)**
    - Redeemable items
    - Redemption processing
    - Webhook integration
    - Fulfillment tracking

### System Features

17. **[Webhooks](./08-webhooks.md)**
    - Stripe webhooks
    - LeadConnector integration
    - Outgoing webhooks
    - Error handling

18. **[Admin Panel](./18-admin-panel.md)**
    - Admin authentication
    - User management
    - Subscription management
    - System administration

19. **[Analytics](./19-analytics.md)**
    - Productivity metrics
    - Task analytics
    - Focus session analytics
    - Performance insights

## 🚀 Getting Started

For new developers starting on this project:

1. **Start with Core Features**: Read Authentication, User Management, and Projects first
2. **Understand Work Flow**: Review Tasks, AI Recommendations, and Focus Planning
3. **Learn Integrations**: Study Subscriptions, Referrals, and Webhooks
4. **Explore Advanced**: Dive into Focus Rooms, Cognitive Load, and Analytics

## 📖 Document Structure

Each feature document follows this structure:

- **Overview**: High-level description of the feature
- **Technical Architecture**: Database models and system design
- **Key Features**: Detailed feature explanations
- **API Endpoints**: Available endpoints
- **Important Code Snippets**: Key implementation details
- **Integration Points**: How it connects with other features
- **Error Handling**: Error scenarios and responses
- **Testing Considerations**: What to test

## 🔗 Related Documentation

- [Main README](../../README.md) - Project setup and overview
- [API Documentation](../../API_DOCUMENTATION.md) - API reference
- [Stripe Setup Guide](../../STRIPE_SETUP_GUIDE.md) - Payment integration
- [Database Schema](../../prisma/schema.prisma) - Prisma schema

## 💡 Tips for Developers

1. **Read in Order**: Features build on each other, so reading in order helps
2. **Check Integration Points**: Many features integrate with others
3. **Review Code Snippets**: They show actual implementation patterns
4. **Understand Database Models**: Prisma schema is the source of truth
5. **Test Scenarios**: Each doc includes testing considerations

## 🛠️ Contributing

When adding new features:

1. Create a new markdown file in this directory
2. Follow the existing document structure
3. Include code snippets and examples
4. Document API endpoints
5. Add integration points
6. Update this README index

## 📝 Notes

- All code snippets are from actual implementation
- Database models use Prisma schema format
- API endpoints follow RESTful conventions
- WebSocket events are documented where applicable

