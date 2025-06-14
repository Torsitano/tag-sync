# tag-sync

A CLI tool for synchronizing AWS EC2 instance, volume, and snapshot tags from a CSV file or SSM Parameter Store. Designed for safe, auditable, and repeatable tag management across your AWS resources.

## Features
- Backup all EC2 instance tags to a JSON file
- Apply default tags to instances from SSM Parameter Store
- Sync instance tags to attached EBS volumes
- Sync volume tags to EBS snapshots
- Sync tags from a CSV file (with optional deletion of tags not in the CSV)
- Restore instance tags from a backup file
- Dry-run support for all operations

## Setup
1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd tag-sync
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure AWS credentials:**
   Ensure your AWS credentials are set up (via environment, `~/.aws/credentials`, or IAM role).

4. **Build (optional, if using ts-node you can skip):**
   ```sh
   npm run build
   ```

## Usage
Run commands with `ts-node` (or `node` if compiled):

### Backup all instance tags
Backs up all EC2 instance tags in your account to a timestamped JSON file in the current directory.
```sh
npx ts-node src/main.ts backup-tags
```

### Apply default tags from SSM Parameter Store
Fetches default tags from AWS SSM Parameter Store and applies them to all EC2 instances. Useful for enforcing organization-wide tags.
```sh
npx ts-node src/main.ts apply-default-tags
```

### Sync instance tags to attached volumes
Copies all tags (except "Name") from each EC2 instance to its attached EBS volumes. Use this to ensure volumes inherit instance tags.
```sh
npx ts-node src/main.ts sync-to-volumes
```

### Sync tags from a CSV file
Synchronizes tags on EC2 instances based on a CSV file. Tags not present in the CSV can optionally be deleted (you will be prompted for confirmation).
```sh
npx ts-node src/main.ts sync-from-csv <csv-file-path>
```
- Example: `npx ts-node src/main.ts sync-from-csv report-1.csv`
- You will be prompted to confirm deletion of tags not present in the CSV.

### Sync volume tags to snapshots
Ensures EBS snapshots inherit all tags from their parent volumes. Only missing or changed tags are applied.
```sh
npx ts-node src/main.ts sync-to-snapshots
```

### Restore instance tags from a backup file
Restores all EC2 instance tags from a previously created backup JSON file.
```sh
npx ts-node src/main.ts restore-backup <backup-file-name>
```
- Example: `npx ts-node src/main.ts restore-backup instance-tags-backup-2025-06-14T17:08:25.083Z.json`

### Test CSV parsing
Parses a CSV file and prints the parsed tag records to the console. Useful for debugging your CSV format.
```sh
npx ts-node src/main.ts test-csv-parse <csv-file-path>
```
- Example: `npx ts-node src/main.ts test-csv-parse report-1.csv`

### Full sync (all-in-one operation)
Performs a full synchronization:
- Backs up all instance tags before any changes
- Syncs tags from CSV to instances (removes/adds/updates tags as specified in the CSV)
- Applies default tags to instances (adds any default tags missing from the CSV)
- Syncs instance tags to attached volumes
- Syncs volume tags to snapshots

```sh
npx ts-node src/main.ts full-sync
```
**Note:**
- The full sync applies default tags *after* the CSV sync. This means any tags missing from the CSV will be added from the default set in SSM.
- It is recommended to set `OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT = false` (the default) in `src/main.ts` so that default tags do **not** overwrite values set in the CSV. This ensures the CSV is the source of truth for any tag it specifies, and default tags only fill in missing values.

This is the recommended way to ensure all resources are tagged consistently in one step.

## CSV Format
- The CSV must have a header row. Example:
  ```csv
  Identifier,Tag: Name,Service,Type,Region,Tag: AllocationCode,Tag: Description,Tag: OrgCode,Tag: Owner,Tag: Practice,Tag: Sector,Tags,ARN
  i-0123456789abcdef,MyInstance,EC2,Instance,us-east-1,123,Test,456,me,doctor,public,7,arn:aws:ec2:us-east-1:123456789012:instance/i-0123456789abcdef
  ```
- **Tag columns must be prefixed with `Tag: `** (e.g., `Tag: Name`).
- **If a tag value is `(not tagged)` or blank, and `DELETE_TAGS_FROM_INSTANCES` is true, that tag will be removed from the instance.**
- **If a tag value is present and different from the current value, it will be updated. If it matches, it will not be re-applied.**
- **Tags not present in the CSV for an instance will be deleted from the instance if `DELETE_TAGS_FROM_INSTANCES` is true and you confirm the prompt.**
- The `Identifier` column must contain the EC2 instance ID.
- Other columns like `Service`, `Type`, `Region`, `Tags`, and `ARN` are for reference/documentation and are not used for tagging.

## SSM Parameter for Default Tags
- The tool can fetch default tags from AWS SSM Parameter Store and apply them to all EC2 instances.
- **Parameter name:** By default, the parameter name is `/tag-sync/tags`. You can change this in `src/main.ts` by editing the `PARAMETER_NAME` constant.
- **Expected format:** The parameter value must be a JSON object where each key is a tag name and each value is the tag value. Example:
  ```json
  {
    "Environment": "Production",
    "Owner": "devops@yourcompany.com",
    "CostCenter": "12345"
  }
  ```
- **How to create:** You can create this parameter in AWS SSM Parameter Store (type: String) and paste the JSON above as the value.
- **What it does:** When you run `apply-default-tags` or `full-sync`, these tags will be applied to all EC2 instances (with overwrite behavior controlled by your config).

## Safety & Dry-Run
- By default, most destructive operations (tag deletion, tag application) support a dry-run mode. Set the `DRY_RUN_*` constants in `src/main.ts` to `true` to preview changes without making them. **Dry-run is enabled by default for safety.**
- When syncing from CSV, you will be prompted before deleting tags from instances.
- **Note:** Only meaningful tag changes and deletions are logged. Skipped/no-change messages are not shown for less verbosity.
