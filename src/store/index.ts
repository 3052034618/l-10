import {
  TrainingRecord,
  TrainingRecordInput,
  UserProfile,
  Team,
  PersonalGoal,
  Course
} from '../types';
import { generateId } from '../utils';

export class DataStore {
  private trainingRecords: Map<string, TrainingRecord> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private teams: Map<string, Team> = new Map();
  private goals: Map<string, PersonalGoal> = new Map();
  private courses: Map<string, Course> = new Map();

  addTrainingRecord(input: TrainingRecordInput): TrainingRecord {
    const now = Date.now();
    const record: TrainingRecord = {
      recordId: generateId(),
      userId: input.userId,
      sportType: input.sportType,
      startTime: input.startTime,
      endTime: input.endTime || input.startTime + input.data.duration * 1000,
      duration: input.data.duration,
      data: input.data,
      courseId: input.courseId,
      notes: input.notes,
      createdAt: now,
      updatedAt: now
    };
    this.trainingRecords.set(record.recordId, record);
    return record;
  }

  getTrainingRecord(recordId: string): TrainingRecord | undefined {
    return this.trainingRecords.get(recordId);
  }

  updateTrainingRecord(recordId: string, updates: Partial<TrainingRecord>): TrainingRecord | undefined {
    const record = this.trainingRecords.get(recordId);
    if (!record) return undefined;
    const updated = { ...record, ...updates, updatedAt: Date.now() };
    this.trainingRecords.set(recordId, updated);
    return updated;
  }

  deleteTrainingRecord(recordId: string): boolean {
    return this.trainingRecords.delete(recordId);
  }

  getTrainingRecordsByUser(userId: string, options?: { sportType?: string; startDate?: number; endDate?: number }): TrainingRecord[] {
    let records = Array.from(this.trainingRecords.values()).filter(r => r.userId === userId);
    
    if (options?.sportType) {
      records = records.filter(r => r.sportType === options.sportType);
    }
    if (options?.startDate) {
      records = records.filter(r => r.startTime >= options.startDate!);
    }
    if (options?.endDate) {
      records = records.filter(r => r.endTime <= options.endDate!);
    }
    
    return records.sort((a, b) => b.startTime - a.startTime);
  }

  getTrainingRecordsByTeam(teamId: string, options?: { sportType?: string; startDate?: number; endDate?: number }): TrainingRecord[] {
    const team = this.teams.get(teamId);
    if (!team) return [];
    
    let allRecords: TrainingRecord[] = [];
    for (const userId of team.memberIds) {
      allRecords = allRecords.concat(this.getTrainingRecordsByUser(userId, options));
    }
    return allRecords.sort((a, b) => b.startTime - a.startTime);
  }

  getTrainingRecordsByCourse(courseId: string): TrainingRecord[] {
    return Array.from(this.trainingRecords.values())
      .filter(r => r.courseId === courseId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  setUserProfile(profile: UserProfile): UserProfile {
    this.userProfiles.set(profile.userId, profile);
    return profile;
  }

  getUserProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  updateUserProfile(userId: string, updates: Partial<UserProfile>): UserProfile | undefined {
    const profile = this.userProfiles.get(userId);
    if (!profile) return undefined;
    const updated = { ...profile, ...updates };
    this.userProfiles.set(userId, updated);
    return updated;
  }

  setTeam(team: Team): Team {
    this.teams.set(team.teamId, team);
    return team;
  }

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  updateTeam(teamId: string, updates: Partial<Team>): Team | undefined {
    const team = this.teams.get(teamId);
    if (!team) return undefined;
    const updated = { ...team, ...updates };
    this.teams.set(teamId, updated);
    return updated;
  }

  addGoal(goal: Omit<PersonalGoal, 'goalId'>): PersonalGoal {
    const newGoal: PersonalGoal = {
      ...goal,
      goalId: generateId()
    };
    this.goals.set(newGoal.goalId, newGoal);
    return newGoal;
  }

  getGoal(goalId: string): PersonalGoal | undefined {
    return this.goals.get(goalId);
  }

  getGoalsByUser(userId: string, options?: { status?: string; sportType?: string }): PersonalGoal[] {
    let goals = Array.from(this.goals.values()).filter(g => g.userId === userId);
    if (options?.status) {
      goals = goals.filter(g => g.status === options.status);
    }
    if (options?.sportType) {
      goals = goals.filter(g => g.sportType === options.sportType);
    }
    return goals;
  }

  updateGoal(goalId: string, updates: Partial<PersonalGoal>): PersonalGoal | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;
    const updated = { ...goal, ...updates };
    this.goals.set(goalId, updated);
    return updated;
  }

  setCourse(course: Course): Course {
    this.courses.set(course.courseId, course);
    return course;
  }

  getCourse(courseId: string): Course | undefined {
    return this.courses.get(courseId);
  }

  getAllCourses(): Course[] {
    return Array.from(this.courses.values());
  }

  getAllRecords(): TrainingRecord[] {
    return Array.from(this.trainingRecords.values());
  }
}

export const dataStore = new DataStore();
