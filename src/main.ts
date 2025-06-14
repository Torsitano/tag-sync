import { EC2Client, Instance, paginateDescribeInstances, paginateDescribeVolumes, Volume } from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { applyDefaultTagsToInstances, backupInstanceTags } from './instances'
import { applyInstanceTagsToVolumes } from './volumes'
import { restoreInstanceTagsFromBackup } from './restoreBackup'
import { parseTagCsv } from './instances'

export const PARAMETER_NAME = '/tag-sync/tags'
export const OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE = true
export const OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT = false
export const APPLY_DEFAULT_TAGS_TO_INSTANCES = true
export const DRY_RUN_INSTANCES = true
export const DRY_RUN_VOLUMES = true

// Retrieves a JSON blob from SSM Parameter Store to use as default tags
export async function getTagsFromSssm( ssmClient: SSMClient ): Promise<Map<string, string>> {
    const command = new GetParameterCommand( {
        Name: PARAMETER_NAME,
    } )

    const response = await ssmClient.send( command )

    if ( !response.Parameter || !response.Parameter.Value ) {
        throw new Error( `Parameter ${PARAMETER_NAME} not found or has no value` )
    }

    const parsedTags: Record<string, string> = JSON.parse( response.Parameter.Value )
    return new Map( Object.entries( parsedTags ) )
}

export async function listEc2Instances( ec2Client: EC2Client ): Promise<Instance[]> {
    const paginator = paginateDescribeInstances( { client: ec2Client }, {} )
    const instances: Instance[] = []
    for await ( const page of paginator ) {
        const reservations = page.Reservations!

        for ( const reservation of reservations ) {
            instances.push( ...reservation.Instances! )
        }
    }

    return instances

}

// Lists all EC2 volumes in the account and returns them as a Map with the Volume ID as the key
export async function listVolumes( ec2Client: EC2Client ): Promise<Map<string, Volume>> {
    const paginator = paginateDescribeVolumes( { client: ec2Client }, {} )

    const volumeMap = new Map<string, Volume>()

    for await ( const page of paginator ) {
        const volumeList = page.Volumes!

        for ( const volume of volumeList ) {
            volumeMap.set( volume.VolumeId!, volume )
        }
    }
    return volumeMap
}

async function handleBackupTags( ec2Client: EC2Client ) {
    const instances = await listEc2Instances( ec2Client )
    backupInstanceTags( instances )
}

async function handleApplyDefaultTags( ec2Client: EC2Client, ssmClient: SSMClient ) {
    const defaultTags = await getTagsFromSssm( ssmClient )
    const instances = await listEc2Instances( ec2Client )
    await applyDefaultTagsToInstances( ec2Client, instances, defaultTags )
}

async function handleSyncToVolumes( ec2Client: EC2Client ) {
    const instances = await listEc2Instances( ec2Client )
    const volumes = await listVolumes( ec2Client )
    for ( const instance of instances ) {
        await applyInstanceTagsToVolumes( ec2Client, instance, volumes )
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

async function handleTestCsvParse() {
    // Get the CSV file to parse from the command listEc2Instances
    const csvFilePath = process.argv[ 3 ]
    if ( !csvFilePath ) {
        console.error( 'Usage: ts-node src/main.ts test-csv-parse <csv-file-path>' )
        process.exit( 1 )
    }

    const parsedRecords = parseTagCsv( csvFilePath )
    console.log( parsedRecords )
}

async function cliEntrypoint() {
    const cmd = process.argv[ 2 ]
    const region = process.env.AWS_REGION || 'us-east-1'
    const ec2Client = new EC2Client( { region } )
    const ssmClient = new SSMClient( { region } )

    switch ( cmd ) {
        case 'backup-tags':
            await handleBackupTags( ec2Client )
            break
        case 'apply-default-tags':
            await handleApplyDefaultTags( ec2Client, ssmClient )
            break
        case 'sync-to-volumes':
            await handleSyncToVolumes( ec2Client )
            break
        case 'restore-backup':
            await handleRestoreBackup( ec2Client )
            break
        // test parse a CSV file and print the results
        case 'test-csv-parse':
            await handleTestCsvParse()
            break
        default:
            console.log( 'Usage: ts-node src/main.ts <backup-tags|apply-default-tags|sync-to-volumes|restore-backup>' )
    }
}

if ( require.main === module ) {
    cliEntrypoint()
}