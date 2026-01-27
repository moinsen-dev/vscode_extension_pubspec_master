/**
 * Validation error for pubspec.yaml
 */
export class PubspecValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = 'PubspecValidationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: PubspecValidationError[];
  warnings: string[];
}

/**
 * Validate a parsed pubspec.yaml structure
 *
 * @param parsed - The parsed YAML object
 * @param filePath - Path to the file (for error messages)
 * @returns Validation result with errors and warnings
 */
export function validatePubspec(
  parsed: Record<string, unknown>,
  filePath: string
): ValidationResult {
  const errors: PubspecValidationError[] = [];
  const warnings: string[] = [];

  // Required field: name
  if (!parsed.name) {
    errors.push(
      new PubspecValidationError(
        'Missing required field: name',
        'name',
        filePath
      )
    );
  } else if (typeof parsed.name !== 'string') {
    errors.push(
      new PubspecValidationError(
        `Field 'name' must be a string, got ${typeof parsed.name}`,
        'name',
        filePath
      )
    );
  } else if (!/^[a-z_][a-z0-9_]*$/.test(parsed.name)) {
    errors.push(
      new PubspecValidationError(
        `Invalid package name '${parsed.name}'. Names must be lowercase, start with a letter or underscore, and contain only letters, numbers, and underscores.`,
        'name',
        filePath
      )
    );
  }

  // Optional field: version (but should be valid if present)
  if (parsed.version !== undefined) {
    if (typeof parsed.version !== 'string') {
      errors.push(
        new PubspecValidationError(
          `Field 'version' must be a string, got ${typeof parsed.version}`,
          'version',
          filePath
        )
      );
    } else if (!isValidSemver(parsed.version)) {
      warnings.push(
        `Version '${parsed.version}' may not follow semantic versioning`
      );
    }
  }

  // Optional field: description
  if (parsed.description !== undefined && typeof parsed.description !== 'string') {
    errors.push(
      new PubspecValidationError(
        `Field 'description' must be a string, got ${typeof parsed.description}`,
        'description',
        filePath
      )
    );
  }

  // Dependencies validation
  validateDependencySection(parsed, 'dependencies', filePath, errors, warnings);
  validateDependencySection(parsed, 'dev_dependencies', filePath, errors, warnings);
  validateDependencySection(parsed, 'dependency_overrides', filePath, errors, warnings);

  // Environment validation
  if (parsed.environment !== undefined) {
    if (typeof parsed.environment !== 'object' || parsed.environment === null) {
      errors.push(
        new PubspecValidationError(
          `Field 'environment' must be an object`,
          'environment',
          filePath
        )
      );
    } else {
      const env = parsed.environment as Record<string, unknown>;
      if (env.sdk !== undefined && typeof env.sdk !== 'string') {
        errors.push(
          new PubspecValidationError(
            `Field 'environment.sdk' must be a string constraint`,
            'environment.sdk',
            filePath
          )
        );
      }
      if (env.flutter !== undefined && typeof env.flutter !== 'string') {
        errors.push(
          new PubspecValidationError(
            `Field 'environment.flutter' must be a string constraint`,
            'environment.flutter',
            filePath
          )
        );
      }
    }
  }

  // Flutter section validation
  if (parsed.flutter !== undefined) {
    if (typeof parsed.flutter !== 'object' || parsed.flutter === null) {
      errors.push(
        new PubspecValidationError(
          `Field 'flutter' must be an object`,
          'flutter',
          filePath
        )
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a dependency section
 */
function validateDependencySection(
  parsed: Record<string, unknown>,
  sectionName: string,
  filePath: string,
  errors: PubspecValidationError[],
  warnings: string[]
): void {
  const section = parsed[sectionName];
  // undefined or null means no dependencies (valid)
  if (section === undefined || section === null) {
    return;
  }

  if (typeof section !== 'object') {
    errors.push(
      new PubspecValidationError(
        `Field '${sectionName}' must be an object`,
        sectionName,
        filePath
      )
    );
    return;
  }

  const deps = section as Record<string, unknown>;
  for (const [depName, depValue] of Object.entries(deps)) {
    validateDependency(depName, depValue, sectionName, filePath, errors, warnings);
  }
}

/**
 * Validate a single dependency entry
 */
function validateDependency(
  name: string,
  value: unknown,
  sectionName: string,
  filePath: string,
  errors: PubspecValidationError[],
  warnings: string[]
): void {
  const fieldPath = `${sectionName}.${name}`;

  // Simple version constraint (string)
  if (typeof value === 'string') {
    if (!isValidVersionConstraint(value)) {
      warnings.push(
        `Dependency '${name}' has unusual version constraint: ${value}`
      );
    }
    return;
  }

  // Complex dependency (object with path, git, sdk, hosted, or version)
  if (typeof value === 'object' && value !== null) {
    const dep = value as Record<string, unknown>;
    const validKeys = ['path', 'git', 'sdk', 'hosted', 'version'];
    const hasValidKey = validKeys.some((key) => dep[key] !== undefined);

    if (!hasValidKey) {
      errors.push(
        new PubspecValidationError(
          `Dependency '${name}' must have at least one of: ${validKeys.join(', ')}`,
          fieldPath,
          filePath
        )
      );
    }

    // Validate path dependency
    if (dep.path !== undefined && typeof dep.path !== 'string') {
      errors.push(
        new PubspecValidationError(
          `Dependency '${name}' path must be a string`,
          `${fieldPath}.path`,
          filePath
        )
      );
    }

    // Validate git dependency
    if (dep.git !== undefined) {
      if (typeof dep.git === 'string') {
        // Simple git URL - valid
      } else if (typeof dep.git === 'object' && dep.git !== null) {
        const git = dep.git as Record<string, unknown>;
        if (typeof git.url !== 'string') {
          errors.push(
            new PubspecValidationError(
              `Dependency '${name}' git.url must be a string`,
              `${fieldPath}.git.url`,
              filePath
            )
          );
        }
      } else {
        errors.push(
          new PubspecValidationError(
            `Dependency '${name}' git must be a string URL or object`,
            `${fieldPath}.git`,
            filePath
          )
        );
      }
    }

    // Validate SDK dependency
    if (dep.sdk !== undefined && typeof dep.sdk !== 'string') {
      errors.push(
        new PubspecValidationError(
          `Dependency '${name}' sdk must be a string (e.g., 'flutter')`,
          `${fieldPath}.sdk`,
          filePath
        )
      );
    }

    return;
  }

  // Null is valid (means "any version")
  if (value === null) {
    return;
  }

  // Invalid type
  errors.push(
    new PubspecValidationError(
      `Dependency '${name}' has invalid value type: ${typeof value}`,
      fieldPath,
      filePath
    )
  );
}

/**
 * Check if a string is a valid semver version
 */
function isValidSemver(version: string): boolean {
  // Basic semver pattern: major.minor.patch with optional pre-release and build metadata
  const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
  return semverPattern.test(version);
}

/**
 * Check if a string looks like a valid version constraint
 */
function isValidVersionConstraint(constraint: string): boolean {
  // Common patterns: ^1.0.0, >=1.0.0 <2.0.0, any, 1.0.0
  const patterns = [
    /^any$/,
    /^\^?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/,
    /^[<>=]+\s*\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\s+[<>=]+\s*\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)*$/,
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/,
  ];
  return patterns.some((p) => p.test(constraint.trim()));
}
