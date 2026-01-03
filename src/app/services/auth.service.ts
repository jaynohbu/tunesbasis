import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { environment } from '../../environments/environment';

export interface AuthUser {
  email: string;
  userId: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userPool: CognitoUserPool;
  private currentUserSubject: BehaviorSubject<AuthUser | null>;
  public currentUser: Observable<AuthUser | null>;

  constructor() {
    const poolData = {
      UserPoolId: environment.cognitoUserPoolId,
      ClientId: environment.cognitoClientId,
    };
    this.userPool = new CognitoUserPool(poolData);

    // Initialize current user subject
    this.currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
    this.currentUser = this.currentUserSubject.asObservable();

    // Initialize current user from session (async)
    this.initializeUser();
  }

  /**
   * Initialize user from existing session
   */
  private async initializeUser(): Promise<void> {
    const session = await this.getSession();
    const user = session ? this.getUserFromSession(session) : null;
    this.currentUserSubject.next(user);
  }

  public get currentUserValue(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  /**
   * Sign up a new user
   */
  signUp(email: string, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const attributeList: CognitoUserAttribute[] = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email,
        }),
      ];

      this.userPool.signUp(email, password, attributeList, [], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Confirm user registration with verification code
   */
  confirmRegistration(email: string, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Sign in user
   */
  signIn(email: string, password: string): Promise<CognitoUserSession> {
    return new Promise((resolve, reject) => {
      const authenticationData = {
        Username: email,
        Password: password,
      };

      const authenticationDetails = new AuthenticationDetails(authenticationData);

      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const user = this.getUserFromSession(session);
          this.currentUserSubject.next(user);
          resolve(session);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  /**
   * Sign out current user
   */
  signOut(): void {
    const cognitoUser = this.userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    this.currentUserSubject.next(null);
  }

  /**
   * Get current session (async)
   */
  async getSession(): Promise<CognitoUserSession | null> {
    const cognitoUser = this.userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    return new Promise((resolve) => {
      cognitoUser.getSession((err: Error | null, result: CognitoUserSession | null) => {
        if (err || !result) {
          resolve(null);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Get ID token for API requests (async)
   */
  async getIdToken(): Promise<string | null> {
    const session = await this.getSession();
    if (!session || !session.isValid()) {
      return null;
    }
    return session.getIdToken().getJwtToken();
  }

  /**
   * Check if user is authenticated (async)
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null && session.isValid();
  }

  /**
   * Get current user ID (Cognito sub)
   */
  async getCurrentUserId(): Promise<string> {
    const session = await this.getSession();
    if (!session || !session.isValid()) {
      throw new Error('No valid session');
    }
    const idToken = session.getIdToken();
    return idToken.payload['sub'];
  }

  /**
   * Initiate forgot password flow
   */
  forgotPassword(email: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.forgotPassword({
        onSuccess: (data) => {
          resolve(data);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  /**
   * Confirm new password after forgot password
   */
  confirmPassword(email: string, code: string, newPassword: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          resolve('Password confirmed!');
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  /**
   * Extract user info from session
   */
  private getUserFromSession(session: CognitoUserSession): AuthUser {
    const idToken = session.getIdToken();
    return {
      email: idToken.payload['email'],
      userId: idToken.payload['sub'],
    };
  }
}
