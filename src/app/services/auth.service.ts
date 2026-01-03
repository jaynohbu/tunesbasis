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

    // Initialize current user from session
    const session = this.getSession();
    const user = session ? this.getUserFromSession(session) : null;
    this.currentUserSubject = new BehaviorSubject<AuthUser | null>(user);
    this.currentUser = this.currentUserSubject.asObservable();
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
   * Get current session
   */
  getSession(): CognitoUserSession | null {
    const cognitoUser = this.userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    let session: CognitoUserSession | null = null;
    cognitoUser.getSession((err: Error | null, result: CognitoUserSession | null) => {
      if (err || !result) {
        session = null;
      } else {
        session = result;
      }
    });

    return session;
  }

  /**
   * Get ID token for API requests
   */
  getIdToken(): string | null {
    const session = this.getSession();
    if (!session || !session.isValid()) {
      return null;
    }
    return session.getIdToken().getJwtToken();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const session = this.getSession();
    return session !== null && session.isValid();
  }

  /**
   * Get current user ID (Cognito sub)
   */
  async getCurrentUserId(): Promise<string> {
    const session = this.getSession();
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
