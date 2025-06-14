import { EC2Client } from '@aws-sdk/client-ec2'
import { SSMClient } from '@aws-sdk/client-ssm'
import { applyDefaultTagsToInstances, backupInstanceTags, syncTagsFromCsv } from './instances'
import { applyInstanceTagsToVolumes } from './volumes'
import { restoreInstanceTagsFromBackup } from './restoreBackup'
import { getTagsFromSssm, listEc2Instances, listSnapshots, listVolumes } from './tagUtils'
import { applyVolumeTagsToSnapshots } from './snapshots'

// Use if you want to get the default tags from SSM Parameter Store
export const PARAMETER_NAME = '/tag-sync/tags'
// Will overwrite tags on a volume if the volume has tags that conflict with the instance tags
export const OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE = true
// Will overwrite tags on an Instance from the default tags from SSM
export const OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT = false
// Will apply default tags to instances
export const APPLY_DEFAULT_TAGS_TO_INSTANCES = true
// Will delete tags from an instance if they are not in the CSV file
export const DELETE_TAGS_FROM_INSTANCES = true
// Will dry run the operations
export const DRY_RUN_INSTANCES = false
export const DRY_RUN_VOLUMES = false
export const DRY_RUN_SNAPSHOTS = false

async function handleBackupTags( ec2Client: EC2Client ) {
    const instances = await listEc2Instances( ec2Client )
    backupInstanceTags( instances )
}

async function handleApplyDefaultTags( ec2Client: EC2Client, ssmClient: SSMClient, skipBackup = false ) {
    const defaultTags = await getTagsFromSssm( ssmClient )
    const instances = await listEc2Instances( ec2Client )
    if ( !skipBackup ) await handleBackupTags( ec2Client )
    await applyDefaultTagsToInstances( ec2Client, instances, defaultTags, DRY_RUN_INSTANCES )
}

async function handleSyncToVolumes( ec2Client: EC2Client ) {
    const instances = await listEc2Instances( ec2Client )
    const volumes = await listVolumes( ec2Client )
    for ( const instance of instances ) {
        await applyInstanceTagsToVolumes( ec2Client, instance, volumes, DRY_RUN_VOLUMES )
    }
}

async function handleRestoreBackup( ec2Client: EC2Client ) {
    // Get the backup file to restore from the command line
    const backupFileName = process.argv[ 3 ]
    if ( !backupFileName ) {
        console.error( 'Usage: ts-node src/main.ts restore-backup <backup-file-name>' )
        process.exit( 1 )
    }
    await restoreInstanceTagsFromBackup( ec2Client, backupFileName )
}

async function handleSyncFromCsv( ec2Client: EC2Client, skipBackup = false ) {
    const csvFilePath = process.argv[ 3 ]
    if ( !csvFilePath ) {
        console.error( 'Usage: ts-node src/main.ts sync-from-csv <csv-file-path>' )
        process.exit( 1 )
    }
    if ( !skipBackup ) await handleBackupTags( ec2Client )
    const instances = await listEc2Instances( ec2Client )
    await syncTagsFromCsv( ec2Client, instances, csvFilePath, DRY_RUN_INSTANCES )
}

async function handleSyncToSnapshots( ec2Client: EC2Client ) {
    const volumes = await listVolumes( ec2Client )
    const snapshots = await listSnapshots( ec2Client )
    await applyVolumeTagsToSnapshots( ec2Client, volumes, snapshots, DRY_RUN_SNAPSHOTS )
}

async function handleFullSync( ec2Client: EC2Client, ssmClient: SSMClient ) {
    await handleBackupTags( ec2Client )
    await handleSyncFromCsv( ec2Client, true )
    await handleApplyDefaultTags( ec2Client, ssmClient, true )
    await handleSyncToVolumes( ec2Client )
    await handleSyncToSnapshots( ec2Client )
}

async function cliEntrypoint() {
    const cmd = process.argv[ 2 ]
    const region = process.env.AWS_REGION || 'us-east-1'
    const ec2Client = new EC2Client( { region } )
    const ssmClient = new SSMClient( { region } )

    switch ( cmd ) {
        case 'backup-tags':
            console.log( 'Backing up tags to file' )
            await handleBackupTags( ec2Client )
            break
        case 'apply-default-tags':
            console.log( 'Applying default tags to instances' )
            await handleApplyDefaultTags( ec2Client, ssmClient )
            break
        case 'sync-to-volumes':
            console.log( 'Syncing tags to volumes' )
            await handleSyncToVolumes( ec2Client )
            break
        case 'restore-backup':
            console.log( 'Restoring tags from backup file' )
            await handleRestoreBackup( ec2Client )
            break
        case 'sync-from-csv':
            console.log( 'Syncing tags from CSV file' )
            await handleSyncFromCsv( ec2Client )
            break
        case 'sync-to-snapshots':
            console.log( 'Syncing tags to snapshots' )
            await handleSyncToSnapshots( ec2Client )
            break
        case 'full-sync':
            console.log( 'Full sync' )
            await handleFullSync( ec2Client, ssmClient )
            break
        default:
            console.log( 'Usage: ts-node src/main.ts <backup-tags|apply-default-tags|sync-to-volumes|restore-backup|test-csv-parse|sync-from-csv|sync-to-snapshots|full-sync>' )
    }
}

if ( require.main === module ) {
    cliEntrypoint()
}