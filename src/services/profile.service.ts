import prisma from "../config/prisma.js";

interface ProfileCompletionResult {
  profileCompletionPercentage: number;
  lastProfileUpdate: Date;
}

const updateProfileCompletion = async (userId: number): Promise<ProfileCompletionResult> => {
  // Get user data to calculate completion percentage
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      phone_number: true,
      company_name: true,
      // company_size: true,
      // company_description: true,
      // founded_year: true,
      website: true,
      profile_photo_url: true,
      job_title: true,
      industry: true,
      bio: true,
      timezone: true,
      linkedin_url: true,
      website_url: true,
      secondary_social_url: true,
      secondary_social_type: true,
      preferred_working_hours: true,
      communication_preference: true,
      primary_work_focus: true,
      profile_completion_percentage: true,
      last_profile_update: true,
    }
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Calculate profile completion percentage
  const completionPercentage = calculateProfileCompletion(user);

  // Update user with new completion percentage and timestamp
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      profile_completion_percentage: completionPercentage,
      last_profile_update: new Date(),
    },
    select: {
      profile_completion_percentage: true,
      last_profile_update: true,
    }
  });

  return {
    profileCompletionPercentage: updatedUser.profile_completion_percentage,
    lastProfileUpdate: updatedUser.last_profile_update,
  };
};

const calculateProfileCompletion = (user: any): number => {
  const fields = [
    { field: 'username', weight: 5 },
    { field: 'name', weight: 5 },
    { field: 'email', weight: 5 },
    { field: 'phone_number', weight: 3 },
    { field: 'company_name', weight: 4 },
    // { field: 'company_size', weight: 2 },
    // { field: 'company_description', weight: 3 },
    // { field: 'founded_year', weight: 2 },
    { field: 'website', weight: 2 },
    { field: 'profile_photo_url', weight: 4 },
    { field: 'job_title', weight: 4 },
    { field: 'industry', weight: 3 },
    { field: 'bio', weight: 3 },
    { field: 'timezone', weight: 2 },
    { field: 'linkedin_url', weight: 3 },
    { field: 'website_url', weight: 2 },
    { field: 'secondary_social_url', weight: 2 },
    { field: 'secondary_social_type', weight: 1 },
    { field: 'preferred_working_hours', weight: 3 },
    { field: 'communication_preference', weight: 2 },
    { field: 'primary_work_focus', weight: 2 },
  ];

  let totalWeight = 0;
  let completedWeight = 0;

  fields.forEach(({ field, weight }) => {
    totalWeight += weight;
    
    const value = user[field];
    if (value !== null && value !== undefined && value !== '') {
      // Special handling for JSON fields
      if (field === 'preferred_working_hours') {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          if (parsed && Object.keys(parsed).length > 0) {
            completedWeight += weight;
          }
        } catch {
          // Invalid JSON, don't count as completed
        }
      } else {
        completedWeight += weight;
      }
    }
  });

  // Calculate percentage, ensuring minimum of 20% (as per schema default)
  const percentage = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 20;
  return Math.max(percentage, 20);
};

export {
  updateProfileCompletion,
  calculateProfileCompletion,
};
