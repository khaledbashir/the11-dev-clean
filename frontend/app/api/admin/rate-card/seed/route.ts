import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/admin/rate-card/seed
 * Seeds the rate_card_roles table with official Social Garden roles
 * This ensures the database has the complete rate card
 */
export async function POST(request: NextRequest) {
    try {
        console.log("🌱 [SEED] Starting rate card seed operation...");

        // First, check if table exists
        const tableCheck = await query(
            `SELECT COUNT(*) as count 
             FROM information_schema.tables 
             WHERE table_schema = DATABASE() 
             AND table_name = 'rate_card_roles'`
        );

        if (tableCheck[0].count === 0) {
            console.log("⚠️ [SEED] Table doesn't exist, creating it...");
            
            // Create table
            await query(`
                CREATE TABLE IF NOT EXISTS rate_card_roles (
                    id VARCHAR(36) PRIMARY KEY,
                    role_name VARCHAR(500) NOT NULL UNIQUE,
                    hourly_rate DECIMAL(10,2) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_role_name (role_name),
                    INDEX idx_is_active (is_active),
                    INDEX idx_hourly_rate (hourly_rate)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            
            console.log("✅ [SEED] Table created");
        }

        // Check current count
        const currentCount = await query(
            "SELECT COUNT(*) as count FROM rate_card_roles WHERE is_active = TRUE"
        );
        const existingRoles = currentCount[0]?.count || 0;

        console.log(`📊 [SEED] Current active roles: ${existingRoles}`);

        // Official Social Garden Rate Card (90 roles)
        const officialRoles = [
            { role: 'Account Management - (Senior Account Director)', rate: 365.00, desc: 'Senior account direction and client strategy' },
            { role: 'Account Management - (Account Director)', rate: 295.00, desc: 'Account director level management' },
            { role: 'Account Management - (Senior Account Manager)', rate: 210.00, desc: 'Senior account management' },
            { role: 'Account Management - (Account Manager)', rate: 180.00, desc: 'Standard account management' },
            { role: 'Account Management (Off)', rate: 120.00, desc: 'Offshore account management support' },
            { role: 'Project Management - (Account Director)', rate: 295.00, desc: 'Project management at director level' },
            { role: 'Project Management - (Account Manager)', rate: 180.00, desc: 'Project management and coordination' },
            { role: 'Project Management - (Senior Account Manager)', rate: 210.00, desc: 'Senior project management' },
            { role: 'Tech - Delivery - Project Coordination', rate: 110.00, desc: 'Project coordination support' },
            { role: 'Tech - Delivery - Project Management', rate: 150.00, desc: 'Technical project management' },
            { role: 'Tech - Head Of - Senior Project Management', rate: 365.00, desc: 'Head of senior project management' },
            { role: 'Tech - Head Of - Customer Experience Strategy', rate: 365.00, desc: 'Head of customer experience' },
            { role: 'Tech - Head Of - Program Strategy', rate: 365.00, desc: 'Head of program strategy' },
            { role: 'Tech - Head Of - System Setup', rate: 365.00, desc: 'Head of system setup and architecture' },
            { role: 'Tech - Sr. Architect - Approval & Testing', rate: 365.00, desc: 'Senior architect approval and QA' },
            { role: 'Tech - Sr. Architect - Consultancy Services', rate: 365.00, desc: 'Senior architect consultancy' },
            { role: 'Tech - Sr. Architect - Data Strategy', rate: 365.00, desc: 'Senior architect data strategy' },
            { role: 'Tech - Sr. Architect - Integration Strategy', rate: 365.00, desc: 'Senior architect integration strategy' },
            { role: 'Tech - Sr. Consultant - Admin Configuration', rate: 295.00, desc: 'Senior consultant admin configuration' },
            { role: 'Tech - Sr. Consultant - Advisory & Consultation', rate: 295.00, desc: 'Senior advisory consultation' },
            { role: 'Tech - Sr. Consultant - Approval & Testing', rate: 295.00, desc: 'Senior consultant QA and testing' },
            { role: 'Tech - Sr. Consultant - Campaign Optimisation', rate: 295.00, desc: 'Senior campaign optimization' },
            { role: 'Tech - Sr. Consultant - Campaign Strategy', rate: 295.00, desc: 'Senior campaign strategy' },
            { role: 'Tech - Sr. Consultant - Database Management', rate: 295.00, desc: 'Senior database management' },
            { role: 'Tech - Sr. Consultant - Reporting', rate: 295.00, desc: 'Senior reporting and analytics' },
            { role: 'Tech - Sr. Consultant - Services', rate: 295.00, desc: 'Senior consulting services' },
            { role: 'Tech - Sr. Consultant - Strategy', rate: 295.00, desc: 'Senior strategic consultation' },
            { role: 'Tech - Sr. Consultant - Training', rate: 295.00, desc: 'Senior training and enablement' },
            { role: 'Tech - Integrations', rate: 170.00, desc: 'Standard integration configuration' },
            { role: 'Tech - Integrations (Srn MAP)', rate: 295.00, desc: 'Senior integration MAP specialist' },
            { role: 'Tech - Specialist - Admin Configuration', rate: 180.00, desc: 'Specialist admin configuration' },
            { role: 'Tech - Specialist - Campaign Optimisation', rate: 180.00, desc: 'Campaign optimization specialist' },
            { role: 'Tech - Specialist - Campaign Orchestration', rate: 180.00, desc: 'Campaign orchestration specialist' },
            { role: 'Tech - Specialist - Database Management', rate: 180.00, desc: 'Database management specialist' },
            { role: 'Tech - Specialist - Email Production', rate: 180.00, desc: 'Email production specialist' },
            { role: 'Tech - Specialist - Integration Configuration', rate: 180.00, desc: 'Integration configuration specialist' },
            { role: 'Tech - Specialist - Integration Services', rate: 190.00, desc: 'Integration services specialist' },
            { role: 'Tech - Specialist - Lead Scoring Setup', rate: 180.00, desc: 'Lead scoring setup specialist' },
            { role: 'Tech - Specialist - Program Management', rate: 180.00, desc: 'Program management specialist' },
            { role: 'Tech - Specialist - Reporting', rate: 180.00, desc: 'Reporting and analytics specialist' },
            { role: 'Tech - Specialist - Services', rate: 180.00, desc: 'General technical services' },
            { role: 'Tech - Specialist - Testing', rate: 180.00, desc: 'QA and testing specialist' },
            { role: 'Tech - Specialist - Training', rate: 180.00, desc: 'Training specialist' },
            { role: 'Tech - Specialist - Workflows', rate: 180.00, desc: 'Workflow automation specialist' },
            { role: 'Tech - Keyword Research', rate: 120.00, desc: 'Keyword research support' },
            { role: 'Tech - Landing Page - (Offshore)', rate: 120.00, desc: 'Offshore landing page development' },
            { role: 'Tech - Landing Page - (Onshore)', rate: 210.00, desc: 'Onshore landing page development' },
            { role: 'Tech - Producer - Admin Configuration', rate: 120.00, desc: 'Producer admin configuration' },
            { role: 'Tech - Producer - Campaign Build', rate: 120.00, desc: 'Campaign build and execution' },
            { role: 'Tech - Producer - Chat Bot / Live Chat', rate: 120.00, desc: 'Chatbot and live chat setup' },
            { role: 'Tech - Producer - Copywriting', rate: 120.00, desc: 'Producer copywriting' },
            { role: 'Tech - Producer - Deployment', rate: 120.00, desc: 'Deployment and go-live support' },
            { role: 'Tech - Producer - Design', rate: 120.00, desc: 'Producer design work' },
            { role: 'Tech - Producer - Development', rate: 120.00, desc: 'Producer development work' },
            { role: 'Tech - Producer - Documentation Setup', rate: 120.00, desc: 'Documentation creation' },
            { role: 'Tech - Producer - Email Production', rate: 120.00, desc: 'Email production and setup' },
            { role: 'Tech - Producer - Field / Property Setup', rate: 120.00, desc: 'Field and property configuration' },
            { role: 'Tech - Producer - Integration Assistance', rate: 120.00, desc: 'Integration support' },
            { role: 'Tech - Producer - Landing Page Production', rate: 120.00, desc: 'Landing page production' },
            { role: 'Tech - Producer - Lead Scoring Setup', rate: 120.00, desc: 'Lead scoring configuration' },
            { role: 'Tech - Producer - Reporting', rate: 120.00, desc: 'Reporting setup' },
            { role: 'Tech - Producer - Services', rate: 120.00, desc: 'General production services' },
            { role: 'Tech - Producer - SMS Setup', rate: 120.00, desc: 'SMS and text setup' },
            { role: 'Tech - Producer - Support & Monitoring', rate: 120.00, desc: 'Ongoing support and monitoring' },
            { role: 'Tech - Producer - Testing', rate: 120.00, desc: 'Testing and QA support' },
            { role: 'Tech - Producer - Training', rate: 120.00, desc: 'Training delivery and materials' },
            { role: 'Tech - Producer - Web Development', rate: 120.00, desc: 'Web development support' },
            { role: 'Tech - Producer - Workflows', rate: 120.00, desc: 'Workflow setup and automation' },
            { role: 'Tech - SEO Producer', rate: 120.00, desc: 'SEO production work' },
            { role: 'Tech - SEO Strategy', rate: 180.00, desc: 'SEO strategy and consultation' },
            { role: 'Tech - Website Optimisation', rate: 120.00, desc: 'Website optimization and improvement' },
            { role: 'Content - Campaign Strategy (Onshore)', rate: 180.00, desc: 'Onshore campaign strategy' },
            { role: 'Content - Keyword Research (Offshore)', rate: 120.00, desc: 'Offshore keyword research' },
            { role: 'Content - Keyword Research (Onshore)', rate: 150.00, desc: 'Onshore keyword research' },
            { role: 'Content - Optimisation (Onshore)', rate: 150.00, desc: 'Onshore content optimization' },
            { role: 'Content - Reporting (Offshore)', rate: 120.00, desc: 'Offshore reporting' },
            { role: 'Content - Reporting (Onshore)', rate: 150.00, desc: 'Onshore reporting' },
            { role: 'Content - SEO Copywriting (Onshore)', rate: 150.00, desc: 'Onshore SEO copywriting' },
            { role: 'Content - SEO Strategy (Onshore)', rate: 210.00, desc: 'Onshore SEO strategy' },
            { role: 'Content - Website Optimisations (Offshore)', rate: 120.00, desc: 'Offshore website optimization' },
            { role: 'Copywriting (Offshore)', rate: 120.00, desc: 'Offshore copywriting services' },
            { role: 'Copywriting (Onshore)', rate: 180.00, desc: 'Onshore copywriting services' },
            { role: 'Design - Digital Asset (Offshore)', rate: 140.00, desc: 'Offshore digital asset design' },
            { role: 'Design - Digital Asset (Onshore)', rate: 190.00, desc: 'Onshore digital asset design' },
            { role: 'Design - Email (Offshore)', rate: 120.00, desc: 'Offshore email design' },
            { role: 'Design - Email (Onshore)', rate: 295.00, desc: 'Onshore email design' },
            { role: 'Design - Landing Page (Offshore)', rate: 120.00, desc: 'Offshore landing page design' },
            { role: 'Design - Landing Page (Onshore)', rate: 190.00, desc: 'Onshore landing page design' },
            { role: 'Dev (orTech) - Landing Page - (Offshore)', rate: 120.00, desc: 'Offshore landing page development' },
            { role: 'Dev (orTech) - Landing Page - (Onshore)', rate: 210.00, desc: 'Onshore landing page development' },
        ];

        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        // Insert or update each role
        for (const { role, rate, desc } of officialRoles) {
            try {
                // Check if role already exists
                const existing = await query(
                    "SELECT id FROM rate_card_roles WHERE role_name = ?",
                    [role]
                );

                if (existing.length > 0) {
                    // Update existing role (ensure it's active and rate is correct)
                    await query(
                        `UPDATE rate_card_roles 
                         SET hourly_rate = ?, is_active = TRUE, description = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE role_name = ?`,
                        [rate, desc, role]
                    );
                    updated++;
                } else {
                    // Insert new role
                    const id = `rc-${uuidv4()}`;
                    await query(
                        `INSERT INTO rate_card_roles (id, role_name, hourly_rate, is_active, description)
                         VALUES (?, ?, ?, TRUE, ?)`,
                        [id, role, rate, desc]
                    );
                    inserted++;
                }
            } catch (error: any) {
                // Skip duplicates (UNIQUE constraint)
                if (error.code === 'ER_DUP_ENTRY') {
                    skipped++;
                    console.warn(`⚠️ [SEED] Skipped duplicate: ${role}`);
                } else {
                    console.error(`❌ [SEED] Error with role "${role}":`, error.message);
                    throw error;
                }
            }
        }

        // Verify final count
        const finalCount = await query(
            "SELECT COUNT(*) as count FROM rate_card_roles WHERE is_active = TRUE"
        );
        const totalRoles = finalCount[0]?.count || 0;

        console.log(`✅ [SEED] Seed operation complete!`);
        console.log(`   Inserted: ${inserted}`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Total active roles: ${totalRoles}`);

        return NextResponse.json({
            success: true,
            message: "Rate card seeded successfully",
            stats: {
                inserted,
                updated,
                skipped,
                totalActiveRoles: totalRoles,
            },
        });
    } catch (error: any) {
        console.error("❌ [SEED] Critical error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to seed rate card",
                message: error.message,
                code: error.code,
            },
            { status: 500 }
        );
    }
}

